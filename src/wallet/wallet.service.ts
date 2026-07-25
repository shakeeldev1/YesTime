import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Wallet } from './schemas/wallet.schema';
import { ClientSession, Model } from 'mongoose';
import { Transaction } from './schemas/transaction.schema';
import { GetTransactionsDto } from './dto/transaction.dto';
import { DepositRequest } from './schemas/deposit-request.schema';
import { CreateDepositRequestDto } from './dto/deposit-request.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UsersService } from '../users/users.service';
import { WithdrawalRequest } from './schemas/withdrawal-request.schema';
import { CreateWithdrawalRequestDto } from './dto/withdrawal-request.dto';

@Injectable()
export class WalletService {
    constructor(
        @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
        @InjectModel(Transaction.name) private readonly transactionModel: Model<Transaction>,
        @InjectModel(DepositRequest.name) private readonly depositRequestModel: Model<DepositRequest>,
        @InjectModel(WithdrawalRequest.name) private readonly withdrawalRequestModel: Model<WithdrawalRequest>,
        private readonly cloudinaryService: CloudinaryService,
        private readonly usersService: UsersService,
    ) { }

    async credit(userId: string, amount: number, description?: string, session?: ClientSession): Promise<Wallet> {
        const wallet = await this.walletModel.findOne({ userId }).session(session || null);
        const transaction = new this.transactionModel({ userId, amount, type: 'credit', description });
        await transaction.save({ session });
        if (!wallet) {
            const newWallet = new this.walletModel({ userId, balance: amount });
            return await newWallet.save({ session });
        } else {
            wallet.balance += amount;
            return await wallet.save({ session });
        }
    }

    async debit(userId: string, amount: number, description?: string, session?: ClientSession): Promise<Wallet> {
        const wallet = await this.walletModel.findOne({ userId }).session(session || null);
        if (!wallet || wallet.balance < amount) {
            throw new BadRequestException('Insufficient balance');
        } else {
            wallet.balance -= amount;
            const transaction = new this.transactionModel({ userId, amount, type: 'debit', description });
            await transaction.save({ session });
            return await wallet.save({ session });
        }
    }

    async createDepositRequest(
        userId: string,
        dto: CreateDepositRequestDto,
        paymentScreenshot?: Express.Multer.File,
    ) {
        if (!paymentScreenshot) {
            throw new BadRequestException('Payment screenshot is required');
        }
        if (!dto.transactionReference || !dto.transactionReference.trim()) {
            throw new BadRequestException('Payment ID / transaction reference is required');
        }

        const duplicate = await this.depositRequestModel.findOne({
            transactionReference: dto.transactionReference.trim(),
            status: { $ne: 'rejected' },
        });
        if (duplicate) {
            throw new BadRequestException('This payment ID has already been submitted. Each payment ID can only be used once.');
        }

        const uploaded = await this.cloudinaryService.uploadImage(paymentScreenshot, 'yes-time/payments');
        const ocrResult = await this.verifyReceiptOcr(uploaded.secure_url, dto.transactionReference.trim(), Number(dto.amount));
        const request = new this.depositRequestModel({
            userId,
            amount: dto.amount,
            paymentMethod: dto.paymentMethod,
            senderName: dto.senderName,
            transactionReference: dto.transactionReference.trim(),
            bankName: dto.bankName,
            note: dto.note,
            paymentScreenshotUrl: uploaded.secure_url,
            status: 'pending',
            ocrRawText: ocrResult.rawText,
            ocrParsedTransactionReference: ocrResult.transactionReference,
            ocrParsedAmount: ocrResult.amount,
            ocrParsedDate: ocrResult.date,
            ocrParsedReceiver: ocrResult.receiver,
            ocrParsedBankName: ocrResult.bankName,
            ocrVerified: ocrResult.verified,
        });

        try {
            await request.save();
        } catch (error: any) {
            if (error?.code === 11000) {
                throw new BadRequestException('This payment ID has already been submitted. Each payment ID can only be used once.');
            }
            throw error;
        }
        return request;
    }

    private normalizeTextForComparison(text: string) {
        return text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    }

    private normalizeAmountValue(value: string | number): number | null {
        const normalized = String(value).replace(/[ ,RsPKR\$\u20B9]/g, '').replace(/[^0-9.]/g, '');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    private extractAmountFromText(text: string): number | null {
        const candidates = Array.from(text.matchAll(/\d{1,3}(?:[.,]\d{3})*(?:\.\d{1,2})?/g));
        for (const match of candidates) {
            const normalized = this.normalizeAmountValue(match[0]);
            if (normalized !== null) {
                return normalized;
            }
        }
        return null;
    }

    private extractDateFromText(text: string): Date | null {
        const datePatterns = [
            /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g,
            /\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/g,
        ];

        for (const pattern of datePatterns) {
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(text)) !== null) {
                const candidate = match[0].replace(/[.\-]/g, '/');
                const parsed = new Date(candidate);
                if (!Number.isNaN(parsed.getTime())) {
                    return parsed;
                }
            }
        }
        return null;
    }

    private extractReceiverFromText(text: string): string | null {
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const receiverKeys = ['receiver', 'beneficiary', 'payee', 'to', 'account name', 'received by'];
        for (const line of lines) {
            const lower = line.toLowerCase();
            if (receiverKeys.some((key) => lower.includes(key))) {
                return line;
            }
        }
        return null;
    }

    private extractBankNameFromText(text: string): string | null {
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const bankKeywords = ['bank', 'easypaisa', 'jazzcash', 'upi', 'account', 'branch', 'payorder'];
        for (const line of lines) {
            const lower = line.toLowerCase();
            if (bankKeywords.some((key) => lower.includes(key))) {
                return line;
            }
        }
        return null;
    }

    private async verifyReceiptOcr(imageUrl: string, submittedTransactionReference: string, submittedAmount: number) {
        const ocrApiKey = process.env.OCR_SPACE_API_KEY;
        if (!ocrApiKey) {
            throw new BadRequestException('OCR service is not configured. Please contact support.');
        }

        const formData = new FormData();
        formData.append('url', imageUrl);
        formData.append('apikey', ocrApiKey);
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');
        formData.append('OCREngine', '2');

        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();
        if (!data || data.IsErroredOnProcessing || !Array.isArray(data.ParsedResults) || data.ParsedResults.length === 0) {
            throw new BadRequestException('OCR verification failed. Please try again with a clearer receipt image.');
        }

        const rawText = String(data.ParsedResults[0].ParsedText || '').trim();
        if (!rawText) {
            throw new BadRequestException('OCR did not find any readable text in the receipt image. Please try again.');
        }

        const normalizedRawText = this.normalizeTextForComparison(rawText);
        const normalizedSubmittedTid = this.normalizeTextForComparison(submittedTransactionReference);
        const tidFound = normalizedRawText.includes(normalizedSubmittedTid);

        const extractedAmount = this.extractAmountFromText(rawText);
        const submittedNormalizedAmount = this.normalizeAmountValue(submittedAmount);
        const amountMatch = extractedAmount !== null && submittedNormalizedAmount !== null && extractedAmount === submittedNormalizedAmount;

        if (!tidFound || !amountMatch) {
            throw new BadRequestException('OCR verification failed: submitted transaction reference or amount did not match the receipt. Please try again with a clearer screenshot and correct values.');
        }

        const parsedDate = this.extractDateFromText(rawText);
        const receiver = this.extractReceiverFromText(rawText);
        const bankName = this.extractBankNameFromText(rawText);

        return {
            rawText,
            transactionReference: submittedTransactionReference,
            amount: submittedAmount,
            date: parsedDate || undefined,
            receiver: receiver || undefined,
            bankName: bankName || undefined,
            verified: true,
        };
    }

    async getMyDepositRequests(userId: string) {
        return this.depositRequestModel.find({ userId }).sort({ createdAt: -1 }).exec();
    }

    async getPendingDepositRequests() {
        const requests = await this.depositRequestModel.find({ status: 'pending' }).sort({ createdAt: 1 }).exec();

        return Promise.all(requests.map(async (request) => {
            const user = await this.usersService.findById(request.userId);
            return {
                ...request.toObject(),
                user: user ? {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                } : null,
            };
        }));
    }

    async approveDepositRequest(requestId: string, adminId: string) {
        const request = await this.depositRequestModel.findById(requestId);
        if (!request) {
            throw new BadRequestException('Payment request not found');
        }
        if (request.status !== 'pending') {
            throw new BadRequestException('Only pending requests can be approved');
        }

        await this.credit(
            request.userId,
            request.amount,
            `Manual deposit approved via ${request.paymentMethod}`,
        );

        request.status = 'approved';
        request.reviewedBy = adminId;
        request.reviewedAt = new Date();
        request.reviewNote = 'Approved by admin';
        await request.save();

        return request;
    }

    async rejectDepositRequest(requestId: string, adminId: string, reason?: string) {
        const request = await this.depositRequestModel.findById(requestId);
        if (!request) {
            throw new BadRequestException('Payment request not found');
        }
        if (request.status !== 'pending') {
            throw new BadRequestException('Only pending requests can be rejected');
        }

        request.status = 'rejected';
        request.reviewedBy = adminId;
        request.reviewedAt = new Date();
        request.reviewNote = reason || 'Rejected by admin';
        await request.save();

        return request;
    }

    async createWithdrawalRequest(userId: string, dto: CreateWithdrawalRequestDto) {
        const amount = Number(dto.amount);
        if (!amount || amount <= 0) {
            throw new BadRequestException('Amount must be greater than 0');
        }

        const wallet = await this.walletModel.findOne({ userId });
        if (!wallet || wallet.balance < amount) {
            throw new BadRequestException('Insufficient balance');
        }

        await this.debit(userId, amount, `Pending withdrawal request via ${dto.withdrawalMethod}`);

        const request = new this.withdrawalRequestModel({
            userId,
            amount,
            withdrawalMethod: dto.withdrawalMethod,
            accountTitle: dto.accountTitle,
            accountNumber: dto.accountNumber,
            bankName: dto.bankName,
            note: dto.note,
            status: 'pending',
        });

        try {
            await request.save();
        } catch (error) {
            await this.credit(userId, amount, 'Reverted failed withdrawal request');
            throw error;
        }

        return request;
    }

    async getMyWithdrawalRequests(userId: string) {
        return this.withdrawalRequestModel.find({ userId }).sort({ createdAt: -1 }).exec();
    }

    async getPendingWithdrawalRequests() {
        const requests = await this.withdrawalRequestModel.find({ status: 'pending' }).sort({ createdAt: 1 }).exec();

        return Promise.all(requests.map(async (request) => {
            const user = await this.usersService.findById(request.userId);
            return {
                ...request.toObject(),
                user: user ? {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                } : null,
            };
        }));
    }

    async markWithdrawalPaid(requestId: string, adminId: string, note?: string) {
        const request = await this.withdrawalRequestModel.findById(requestId);
        if (!request) {
            throw new BadRequestException('Withdrawal request not found');
        }
        if (request.status !== 'pending') {
            throw new BadRequestException('Only pending requests can be updated');
        }

        request.status = 'paid';
        request.reviewedBy = adminId;
        request.reviewedAt = new Date();
        request.reviewNote = note || 'Paid manually by admin';
        request.paidAt = new Date();
        await request.save();

        return request;
    }

    async rejectWithdrawalRequest(requestId: string, adminId: string, reason?: string) {
        const request = await this.withdrawalRequestModel.findById(requestId);
        if (!request) {
            throw new BadRequestException('Withdrawal request not found');
        }
        if (request.status !== 'pending') {
            throw new BadRequestException('Only pending requests can be rejected');
        }

        await this.credit(request.userId, request.amount, 'Refund for rejected withdrawal request');

        request.status = 'rejected';
        request.reviewedBy = adminId;
        request.reviewedAt = new Date();
        request.reviewNote = reason || 'Rejected by admin';
        await request.save();

        return request;
    }

    async getBalance(userId: string): Promise<number> {
        const wallet = await this.walletModel.findOne({ userId });
        return wallet ? wallet.balance : 0;
    }

    async getTransactions(userId: string, query: GetTransactionsDto): Promise<Transaction[]> {
        const page = query.limit ? Math.ceil(query.limit / 10) : 1;
        const limit = query.limit || 10;
        const skip = (page - 1) * limit;

        const filter: any = { userId };
        if (query.type) {
            filter.type = query.type;
        }
        if (query.from) {
            filter.createdAt = { ...filter.createdAt, $gte: new Date(query.from) };
        }
        if (query.to) {
            filter.createdAt = { ...filter.createdAt, $lte: new Date(query.to) };
        }

        return await this.transactionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    }
}

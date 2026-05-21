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

@Injectable()
export class WalletService {
    constructor(
        @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
        @InjectModel(Transaction.name) private readonly transactionModel: Model<Transaction>,
        @InjectModel(DepositRequest.name) private readonly depositRequestModel: Model<DepositRequest>,
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

        const uploaded = await this.cloudinaryService.uploadImage(paymentScreenshot, 'yes-time/payments');
        const request = new this.depositRequestModel({
            userId,
            amount: dto.amount,
            paymentMethod: dto.paymentMethod,
            senderName: dto.senderName,
            transactionReference: dto.transactionReference,
            bankName: dto.bankName,
            note: dto.note,
            paymentScreenshotUrl: uploaded.secure_url,
            status: 'pending',
        });

        await request.save();
        return request;
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

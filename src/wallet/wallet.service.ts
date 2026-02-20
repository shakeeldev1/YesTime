import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Wallet } from './schemas/wallet.schema';
import { Model } from 'mongoose';
import { Transaction } from './schemas/transaction.schema';
import { GetTransactionsDto } from './dto/transaction.dto';

@Injectable()
export class WalletService {
    constructor(
        @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
        @InjectModel(Transaction.name) private readonly transactionModel: Model<Transaction>
    ) { }

    async credit(userId: string, amount: number): Promise<Wallet> {
        const wallet = await this.walletModel.findOne({ userId });
        const transaction = new this.transactionModel({ userId, amount, type: 'credit' });
        await transaction.save();
        if (!wallet) {
            const newWallet = new this.walletModel({ userId, balance: amount });
            return await newWallet.save();
        } else {
            wallet.balance += amount;
            return await wallet.save();
        }
    }

    async debit(userId: string, amount: number): Promise<Wallet> {
        const wallet = await this.walletModel.findOne({ userId });
        if (!wallet || wallet.balance < amount) {
            throw new BadRequestException('Insufficient balance');
        } else {
            wallet.balance -= amount;
            const transaction = new this.transactionModel({ userId, amount, type: 'debit' });
            await transaction.save();
            return await wallet.save();
        }
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

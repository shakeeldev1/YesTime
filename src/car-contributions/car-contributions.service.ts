import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CarContribution, } from './schemas/car-contribution.schema';
import { Model } from 'mongoose';
import { Wallet } from 'src/wallet/schemas/wallet.schema';
import { CarParticipation } from 'src/car-participation/schemas/car-participation.schema';

@Injectable()
export class CarContributionsService {
    constructor(
        @InjectModel(CarContribution.name) private carContributionModel: Model<CarContribution>,
        @InjectModel(Wallet.name) private walletModel: Model<Wallet>,
        @InjectModel(CarParticipation.name) private carParticipationModel: Model<CarParticipation>
    ) { }

    async create(userId: string, carParticipationId: string, amount: number) {
        const carParticipation = await this.carParticipationModel.findById(carParticipationId);
        if (!carParticipation) throw new Error('Car participation not found');
        const wallet = await this.walletModel.findOne({ userId });
        if (!wallet) throw new Error('Wallet not found');
        if (wallet.balance < amount) throw new Error('Insufficient balance');
        wallet.balance -= amount;
        await wallet.save();
        const contribution = new this.carContributionModel({
            carParticipationId,
            userId,
            amount
        });
        return contribution.save();
    }

    async getMyContributions(userId: string) {
        return this.carContributionModel.find({ userId }).populate('carParticipationId');
    }
}

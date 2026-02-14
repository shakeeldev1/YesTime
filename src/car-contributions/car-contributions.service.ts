import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CarContribution, } from './schemas/car-contribution.schema';
import { Model } from 'mongoose';
import { Wallet } from 'src/wallet/schemas/wallet.schema';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from 'src/car-participation/schemas/car-participation.schema';
import { CarWinner } from 'src/car-winner/schemas/car-winner.schema';

const PRE_WIN_MONTHLY = 1500;
const POST_WIN_MONTHLY = 36000;
const THRESHOLD_AMOUNT = 546000;
const CAR_PRICE = 3000000;

@Injectable()
export class CarContributionsService {
    constructor(
        @InjectModel(CarContribution.name) private carContributionModel: Model<CarContribution>,
        @InjectModel(Wallet.name) private walletModel: Model<Wallet>,
        @InjectModel(CarParticipation.name) private carParticipationModel: Model<CarParticipation>,
        @InjectModel(CarWinner.name) private carWinnerModel: Model<CarWinner>
    ) { }

    async create(userId: string, carParticipationId: string, amount: number) {
        const carParticipation = await this.carParticipationModel.findById(carParticipationId);
        if (!carParticipation) throw new Error('Car participation not found');
        if (carParticipation.userId.toString() !== userId) throw new Error('Unauthorized');

        // Validate amount based on phase
        const requiredAmount = carParticipation.phase === ParticipationPhase.PRE_WIN 
            ? PRE_WIN_MONTHLY 
            : POST_WIN_MONTHLY;

        if (amount !== requiredAmount) {
            throw new Error(`Payment amount must be ${requiredAmount} for current phase`);
        }

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
        await contribution.save();

        // Update participation
        carParticipation.totalPaid += amount;
        carParticipation.lastPaymentDate = new Date();

        // Check if threshold reached for auto car award
        if (carParticipation.phase === ParticipationPhase.PRE_WIN && 
            carParticipation.totalPaid >= THRESHOLD_AMOUNT && 
            !carParticipation.carAwarded) {
            
            carParticipation.carAwarded = true;
            carParticipation.carAwardedDate = new Date();
            carParticipation.phase = ParticipationPhase.POST_WIN;

            // Create winner entry
            const winner = new this.carWinnerModel({
                carParticipationId: carParticipation._id,
                userId: carParticipation.userId,
                winningCoupen: carParticipation.coupenNumber,
                winType: 'threshold',
                winningDate: new Date()
            });
            await winner.save();
        }

        // Check if post-win payment completed
        if (carParticipation.phase === ParticipationPhase.POST_WIN && 
            carParticipation.totalPaid >= CAR_PRICE) {
            carParticipation.phase = ParticipationPhase.COMPLETED;
            carParticipation.status = ParticipationStatus.COMPLETED;
        }

        await carParticipation.save();

        return {
            contribution,
            participation: carParticipation,
            message: carParticipation.carAwarded && carParticipation.carAwardedDate?.getTime() === new Date().getTime() 
                ? 'Congratulations! You have reached the threshold and been awarded a car!' 
                : 'Payment successful'
        };
    }

    async getMyContributions(userId: string) {
        return this.carContributionModel.find({ userId })
            .populate('carParticipationId')
            .sort({ createdAt: -1 });
    }

    async getContributionsByParticipation(participationId: string) {
        return this.carContributionModel.find({ carParticipationId: participationId })
            .sort({ createdAt: -1 });
    }

    async getContributionStats(userId: string) {
        const participation = await this.carParticipationModel.findOne({ userId });
        if (!participation) {
            return { hasJoined: false };
        }

        const contributions = await this.carContributionModel.find({ userId });
        const totalContributions = contributions.length;
        const lastPayment = contributions.length > 0 
            ? contributions.sort((a, b) => b.date.getTime() - a.date.getTime())[0] 
            : null;

        let targetAmount = CAR_PRICE;
        let progressPercentage = (participation.totalPaid / targetAmount) * 100;

        if (participation.phase === ParticipationPhase.PRE_WIN) {
            targetAmount = THRESHOLD_AMOUNT;
            progressPercentage = (participation.totalPaid / targetAmount) * 100;
        }

        return {
            hasJoined: true,
            participation,
            totalContributions,
            totalPaid: participation.totalPaid,
            targetAmount,
            progressPercentage,
            lastPayment,
            nextPaymentAmount: participation.phase === ParticipationPhase.PRE_WIN 
                ? PRE_WIN_MONTHLY 
                : POST_WIN_MONTHLY,
            remainingAmount: targetAmount - participation.totalPaid
        };
    }
}


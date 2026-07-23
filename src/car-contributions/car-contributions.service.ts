import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CarContribution, } from './schemas/car-contribution.schema';
import { Model, Types } from 'mongoose';
import { Wallet } from 'src/wallet/schemas/wallet.schema';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from 'src/car-participation/schemas/car-participation.schema';
import { getCarPlan } from 'src/car-participation/car-plans';
import { CarWinner } from 'src/car-winner/schemas/car-winner.schema';
import { User } from 'src/users/schemas/user.schema';
import { MailerService } from 'src/mailer/mailer.service';
import { UsersService } from 'src/users/users.service';

const REFERRAL_PERCENTAGE = 0.20; // 20% referral bonus, flat across every plan

@Injectable()
export class CarContributionsService {
    constructor(
        @InjectModel(CarContribution.name) private carContributionModel: Model<CarContribution>,
        @InjectModel(Wallet.name) private walletModel: Model<Wallet>,
        @InjectModel(CarParticipation.name) private carParticipationModel: Model<CarParticipation>,
        @InjectModel(CarWinner.name) private carWinnerModel: Model<CarWinner>,
        @InjectModel(User.name) private userModel: Model<User>,
        private mailerService: MailerService,
        private usersService: UsersService,
    ) { }

    async create(userId: string, carParticipationId: string, amount: number) {
        const carParticipation = await this.carParticipationModel.findById(carParticipationId);
        if (!carParticipation) throw new Error('Car participation not found');
        if (carParticipation.userId.toString() !== userId) throw new Error('Unauthorized');

        const plan = getCarPlan(carParticipation.planId);

        // Validate amount based on phase
        if (carParticipation.phase === ParticipationPhase.PRE_WIN) {
            if (amount < plan.dailyMin || amount > plan.dailyMax) {
                throw new Error(`Payment amount must be between PKR ${plan.dailyMin} and PKR ${plan.dailyMax} for daily contribution`);
            }
        } else if (carParticipation.phase === ParticipationPhase.POST_WIN) {
            if (amount !== plan.postWinMonthly) {
                throw new Error(`Payment amount must be PKR ${plan.postWinMonthly} for post-win monthly payment`);
            }
        }

        const wallet = await this.walletModel.findOne({ userId });
        if (!wallet) throw new Error('Wallet not found');
        if (wallet.balance < amount) throw new Error('Insufficient balance');

        wallet.balance -= amount;
        await wallet.save();

        const contribution = new this.carContributionModel({
            carParticipationId: new Types.ObjectId(carParticipationId),
            userId: new Types.ObjectId(userId),
            amount
        });
        await contribution.save();

        // Update participation
        // Ensure totalPaid is a number (avoid string concatenation if it's stored as string)
        carParticipation.totalPaid = Number(carParticipation.totalPaid || 0) + Number(amount);
        carParticipation.lastPaymentDate = new Date();

        // Process referral bonus
        await this.processReferralBonus(carParticipation, amount);

        let carAwardedNow = false;

        // Check if threshold reached for direct car award
        if (carParticipation.phase === ParticipationPhase.PRE_WIN &&
            carParticipation.totalPaid >= plan.directAwardThreshold &&
            !carParticipation.carAwarded) {

            carParticipation.carAwarded = true;
            carParticipation.carAwardedDate = new Date();
            carParticipation.phase = ParticipationPhase.POST_WIN;
            carAwardedNow = true;

            // Create winner entry
            const winner = new this.carWinnerModel({
                carParticipationId: carParticipation._id,
                userId: carParticipation.userId,
                winningCoupen: carParticipation.coupenNumber,
                winType: 'threshold',
                winningDate: new Date()
            });
            await winner.save();

            // Send car award email
            const user = await this.userModel.findById(userId);
            if (user) {
                await this.mailerService.sendCarAwardEmail(user.email, user.name, 'direct');
            }
        }

        // Check if post-win payment completed
        if (carParticipation.phase === ParticipationPhase.POST_WIN &&
            carParticipation.totalPaid >= plan.targetAmount) {
            carParticipation.phase = ParticipationPhase.COMPLETED;
            carParticipation.status = ParticipationStatus.COMPLETED;
        }

        await carParticipation.save();

        return {
            contribution,
            participation: carParticipation,
            plan,
            message: carAwardedNow
                ? `Congratulations! You have reached PKR ${plan.directAwardThreshold.toLocaleString()} and been awarded a car! Your monthly payment is now PKR ${plan.postWinMonthly.toLocaleString()}.`
                : 'Payment successful'
        };
    }

    // Process referral bonus: 20% of each contribution goes to referrer
    private async processReferralBonus(participation: CarParticipation, amount: number) {
        if (!participation.referredBy) return;

        const referralBonus = Math.round(amount * REFERRAL_PERCENTAGE);
        if (referralBonus <= 0) return;

        const referrerUserId = participation.referredBy.toString();
        
        // Credit referral bonus to referrer's wallet
        const referrerWallet = await this.walletModel.findOne({ userId: referrerUserId });
        if (referrerWallet) {
            referrerWallet.balance += referralBonus;
            await referrerWallet.save();
        } else {
            const newWallet = new this.walletModel({ userId: referrerUserId, balance: referralBonus });
            await newWallet.save();
        }

        // Update referrer's total referral earnings
        await this.userModel.findByIdAndUpdate(referrerUserId, {
            $inc: { totalReferralEarnings: referralBonus }
        });

        // Send email notification to referrer
        const referrer = await this.userModel.findById(referrerUserId);
        const referredUser = await this.userModel.findById(participation.userId);
        if (referrer && referredUser) {
            await this.mailerService.sendReferralBonusEmail(
                referrer.email, 
                referrer.name, 
                referralBonus, 
                referredUser.name
            );
        }
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
        // contributions use `createdAt` timestamp from mongoose timestamps
        const lastPayment = contributions.length > 0 
            ? contributions.sort((a, b) => new Date((b as any).createdAt).getTime() - new Date((a as any).createdAt).getTime())[0]
            : null;

        const plan = getCarPlan(participation.planId);
        let targetAmount = plan.targetAmount;
        // Ensure numeric math for progress
        let progressPercentage = (Number(participation.totalPaid || 0) / targetAmount) * 100;

        if (participation.phase === ParticipationPhase.PRE_WIN) {
            targetAmount = plan.directAwardThreshold;
            progressPercentage = (Number(participation.totalPaid || 0) / targetAmount) * 100;
        }

        // Get referral info (backfill a referral code for accounts created before signup assigned one)
        const user = await this.userModel.findById(userId);
        const referralCode = user?.referralCode || (user ? await this.usersService.ensureReferralCode(userId) : null);
        const referralCount = await this.carParticipationModel.countDocuments({ referredBy: userId });
        const referredParticipations = await this.carParticipationModel
            .find({ referredBy: new Types.ObjectId(userId) })
            .select('userId coupenNumber totalPaid phase status')
            .lean();

        const referredUserIds = referredParticipations.map((p) => p.userId);
        const referredUsers = referredUserIds.length > 0
            ? await this.userModel.find({ _id: { $in: referredUserIds } }).select('name email').lean()
            : [];

        const userMap = new Map(referredUsers.map((u) => [String(u._id), u]));
        const referralMembers = referredParticipations.map((p) => {
            const referredUser = userMap.get(String(p.userId));
            return {
                userId: p.userId,
                name: referredUser?.name || 'Unknown User',
                email: referredUser?.email || '',
                couponNumber: p.coupenNumber,
                totalPaid: p.totalPaid,
                phase: p.phase,
                status: p.status,
            };
        });

        return {
            hasJoined: true,
            participation,
            planId: participation.planId,
            plan,
            totalContributions,
            totalPaid: participation.totalPaid,
            targetAmount,
            progressPercentage,
            lastPayment,
            paymentRange: participation.phase === ParticipationPhase.PRE_WIN
                ? { min: plan.dailyMin, max: plan.dailyMax }
                : { min: plan.postWinMonthly, max: plan.postWinMonthly },
            remainingAmount: Math.max(0, targetAmount - participation.totalPaid),
            referralCode: referralCode || null,
            totalReferralEarnings: user?.totalReferralEarnings || 0,
            referralCount,
            referralMembers,
        };
    }
}


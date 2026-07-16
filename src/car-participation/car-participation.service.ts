import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from './schemas/car-participation.schema';
import { CarPlayEntry } from './schemas/car-play-entry.schema';
import { CarContribution } from '../car-contributions/schemas/car-contribution.schema';
import { UsersService } from '../users/users.service';
import { Model, Types } from 'mongoose';

// PKR 50 of same-day PRE_WIN contribution buys one independent play/draw chance.
const PKR_PER_PLAY = 50;

@Injectable()
export class CarParticipationService {
    @InjectModel(CarParticipation.name)
    private readonly carParticipationModel: Model<CarParticipation>;

    @InjectModel(CarPlayEntry.name)
    private readonly carPlayEntryModel: Model<CarPlayEntry>;

    @InjectModel(CarContribution.name)
    private readonly carContributionModel: Model<CarContribution>;

    constructor(private readonly usersService: UsersService) {}

    private getUtcDateKey(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    private getNextUtcMidnight(reference: Date): Date {
        const next = new Date(reference);
        next.setUTCHours(24, 0, 0, 0);
        return next;
    }

    private async getEligibleParticipationForPlay(userId: string) {
        return this.carParticipationModel.findOne({
            userId,
            status: ParticipationStatus.ACTIVE,
            phase: ParticipationPhase.PRE_WIN,
            hasWon: false,
            carAwarded: false,
        });
    }

    // 6 digit unique coupen code generator
    private async generateUniqueCoupen() {
        let coupen = Math.floor(100000 + Math.random() * 900000).toString();
        while (await this.carParticipationModel.findOne({ coupenNumber: coupen })) {
            coupen = Math.floor(100000 + Math.random() * 900000).toString();
        }
        return coupen;
    }

    // referralCode is the referrer's shareable code (User.referralCode). referredByUserId
    // (a raw user id) is accepted too for backwards compatibility.
    async join(userId: string, referralCode?: string, referredByUserId?: string) {
        const existingParticipation = await this.carParticipationModel.findOne({ userId });
        if (existingParticipation) {
            return { message: "User has already joined", coupen: existingParticipation.coupenNumber };
        }

        let referrerId: string | undefined = referredByUserId;
        if (referralCode) {
            const referrer = await this.usersService.findByReferralCode(referralCode.trim().toUpperCase());
            if (!referrer) {
                throw new BadRequestException('Invalid referral code.');
            }
            if (referrer._id.toString() === userId) {
                throw new BadRequestException('You cannot refer yourself.');
            }
            referrerId = referrer._id.toString();
        }

        const coupenNumber = await this.generateUniqueCoupen();
        const participationData: any = { userId, coupenNumber };
        if (referrerId) {
            participationData.referredBy = new Types.ObjectId(referrerId);
        }
        const newParticipation = new this.carParticipationModel(participationData);
        await newParticipation.save();
        return { message: "User joined successfully", coupen: coupenNumber };
    }

    async getParticipation(userId: string) {
        return await this.carParticipationModel.findOne({ userId });
    }

    private getUtcDayRange(reference: Date): { start: Date; end: Date } {
        const start = new Date(reference);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setUTCHours(24, 0, 0, 0);
        return { start, end };
    }

    // Sums today's PRE_WIN contributions for this user to determine how many
    // independent play chances (PKR 50 = 1 play) they've earned today.
    private async getTodaysContributionAmount(userId: string, now: Date): Promise<number> {
        const { start, end } = this.getUtcDayRange(now);
        const result = await this.carContributionModel.aggregate([
            { $match: { userId: new Types.ObjectId(userId), createdAt: { $gte: start, $lt: end } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        return result[0]?.total || 0;
    }

    // Each call spends exactly one play (one independent draw chance), so a user who
    // contributed enough for multiple plays today can call this repeatedly until their
    // plays for the day are used up. Contributing more later raises the available count.
    async playNow(userId: string) {
        const participation = await this.getEligibleParticipationForPlay(userId);
        if (!participation) {
            throw new BadRequestException('You do not have an eligible coupon to play now.');
        }

        const now = new Date();
        const playDateKey = this.getUtcDateKey(now);

        const todaysContribution = await this.getTodaysContributionAmount(userId, now);
        const playsAvailableToday = Math.floor(todaysContribution / PKR_PER_PLAY);
        const playsUsedToday = await this.carPlayEntryModel.countDocuments({
            userId: new Types.ObjectId(userId),
            playDateKey,
        });

        if (playsAvailableToday < 1) {
            throw new BadRequestException(`You need to contribute at least PKR ${PKR_PER_PLAY} today before you can play. Make a payment first.`);
        }

        if (playsUsedToday >= playsAvailableToday) {
            throw new BadRequestException(`You have used all ${playsAvailableToday} of your plays for today. Contribute more to earn more plays.`);
        }

        const entry = new this.carPlayEntryModel({
            userId: new Types.ObjectId(userId),
            coupenNumber: participation.coupenNumber,
            playDateKey,
            status: 'pending',
            enteredAt: now,
        });
        await entry.save();

        const playsRemainingToday = playsAvailableToday - (playsUsedToday + 1);

        return {
            message: playsRemainingToday > 0
                ? `Joined the next draw. ${playsRemainingToday} play${playsRemainingToday > 1 ? 's' : ''} left today.`
                : "Joined the next draw. That was your last play for today.",
            canPlayToday: playsRemainingToday > 0,
            hasPlayedToday: true,
            enteredIntoNextDraw: true,
            playsUsedToday: playsUsedToday + 1,
            playsAvailableToday,
            playsRemainingToday,
            playDateKey,
            coupenNumber: participation.coupenNumber,
            nextEligiblePlayAt: playsRemainingToday > 0 ? null : this.getNextUtcMidnight(now),
        };
    }

    async getMyPlayStatus(userId: string) {
        const participation = await this.getEligibleParticipationForPlay(userId);
        const hasJoinedScheme = !!(await this.carParticipationModel.findOne({ userId }));
        const now = new Date();
        const playDateKey = this.getUtcDateKey(now);

        const todayEntries = await this.carPlayEntryModel.find({
            userId: new Types.ObjectId(userId),
            playDateKey,
        });

        const hasPlayedToday = todayEntries.length > 0;
        const enteredIntoNextDraw = todayEntries.some((entry) => entry.status === 'pending');
        const todaysContribution = await this.getTodaysContributionAmount(userId, now);
        const playsAvailableToday = Math.floor(todaysContribution / PKR_PER_PLAY);
        const playsUsedToday = todayEntries.length;
        const playsRemainingToday = Math.max(0, playsAvailableToday - playsUsedToday);
        const canPlayToday = !!participation && playsRemainingToday > 0;

        return {
            hasJoinedScheme,
            hasEligibleCoupon: !!participation,
            canPlayToday,
            hasPlayedToday,
            enteredIntoNextDraw,
            playsToday: playsUsedToday,
            playsAvailableToday,
            playsRemainingToday,
            statusText: canPlayToday
                ? `Ready to Play (${playsRemainingToday} left today)`
                : hasPlayedToday
                    ? 'Already used all plays today'
                    : `Contribute at least PKR ${PKR_PER_PLAY} today to play`,
            coupenNumber: participation?.coupenNumber || null,
            nextEligiblePlayAt: canPlayToday ? null : this.getNextUtcMidnight(now),
        };
    }

    async getAllParticipations() {
        return await this.carParticipationModel.find();
    }
}

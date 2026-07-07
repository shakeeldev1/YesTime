import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from './schemas/car-participation.schema';
import { CarPlayEntry } from './schemas/car-play-entry.schema';
import { CarContribution } from '../car-contributions/schemas/car-contribution.schema';
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

    async join(userId: string, referredByUserId?: string) {
        const existingParticipation = await this.carParticipationModel.findOne({ userId });
        if (existingParticipation) {
            return { message: "User has already joined", coupen: existingParticipation.coupenNumber };
        }
        const coupenNumber = await this.generateUniqueCoupen();
        const participationData: any = { userId, coupenNumber };
        if (referredByUserId) {
            participationData.referredBy = new Types.ObjectId(referredByUserId);
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
        const userIdFilter: Array<string | Types.ObjectId> = [userId];
        if (Types.ObjectId.isValid(userId)) {
            userIdFilter.unshift(new Types.ObjectId(userId));
        }
        const result = await this.carContributionModel.aggregate([
            { $match: { userId: { $in: userIdFilter }, createdAt: { $gte: start, $lt: end } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        return result[0]?.total || 0;
    }

    async playNow(userId: string) {
        const participation = await this.getEligibleParticipationForPlay(userId);
        if (!participation) {
            throw new BadRequestException('You do not have an eligible coupon to play now.');
        }

        const now = new Date();
        const playDateKey = this.getUtcDateKey(now);

        const existingToday = await this.carPlayEntryModel.findOne({
            userId: new Types.ObjectId(userId),
            playDateKey,
        });

        if (existingToday) {
            const message = existingToday.status === 'pending'
                ? "Joined Today's Lottery"
                : 'Already Played Today';
            throw new BadRequestException(message);
        }

        const todaysContribution = await this.getTodaysContributionAmount(userId, now);
        const plays = Math.floor(todaysContribution / PKR_PER_PLAY);
        if (plays < 1) {
            throw new BadRequestException(`You need to contribute at least PKR ${PKR_PER_PLAY} today before you can play. Make a payment first.`);
        }

        const entries = Array.from({ length: plays }, () => ({
            userId: new Types.ObjectId(userId),
            coupenNumber: participation.coupenNumber,
            playDateKey,
            status: 'pending',
            enteredAt: now,
        }));

        try {
            await this.carPlayEntryModel.insertMany(entries);

            return {
                message: `Joined Today's Lottery with ${plays} play${plays > 1 ? 's' : ''}`,
                canPlayToday: false,
                hasPlayedToday: true,
                enteredIntoNextDraw: true,
                playsCount: plays,
                playDateKey,
                coupenNumber: participation.coupenNumber,
                nextEligiblePlayAt: this.getNextUtcMidnight(now),
            };
        } catch (error: any) {
            if (error?.code === 11000) {
                throw new BadRequestException('Already Played Today');
            }
            throw error;
        }
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

        return {
            hasJoinedScheme,
            hasEligibleCoupon: !!participation,
            canPlayToday: !!participation && !hasPlayedToday && playsAvailableToday >= 1,
            hasPlayedToday,
            enteredIntoNextDraw,
            playsToday: todayEntries.length,
            playsAvailableToday,
            statusText: enteredIntoNextDraw
                ? "Joined Today's Lottery"
                : hasPlayedToday
                    ? 'Already Played Today'
                    : playsAvailableToday >= 1
                        ? 'Ready to Play'
                        : `Contribute at least PKR ${PKR_PER_PLAY} today to play`,
            coupenNumber: participation?.coupenNumber || null,
            nextEligiblePlayAt: hasPlayedToday ? this.getNextUtcMidnight(now) : null,
        };
    }

    async getAllParticipations() {
        return await this.carParticipationModel.find();
    }
}

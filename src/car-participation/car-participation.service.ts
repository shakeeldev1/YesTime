import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from './schemas/car-participation.schema';
import { CarPlayEntry } from './schemas/car-play-entry.schema';
import { Model, Types } from 'mongoose';

@Injectable()
export class CarParticipationService {
    @InjectModel(CarParticipation.name)
    private readonly carParticipationModel: Model<CarParticipation>;

    @InjectModel(CarPlayEntry.name)
    private readonly carPlayEntryModel: Model<CarPlayEntry>;

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

        try {
            const entry = new this.carPlayEntryModel({
                userId: new Types.ObjectId(userId),
                coupenNumber: participation.coupenNumber,
                playDateKey,
                status: 'pending',
                enteredAt: now,
            });
            await entry.save();

            return {
                message: "Joined Today's Lottery",
                canPlayToday: false,
                hasPlayedToday: true,
                enteredIntoNextDraw: true,
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

        const todayEntry = await this.carPlayEntryModel.findOne({
            userId: new Types.ObjectId(userId),
            playDateKey,
        });

        const hasPlayedToday = !!todayEntry;
        const enteredIntoNextDraw = todayEntry?.status === 'pending';

        return {
            hasJoinedScheme,
            hasEligibleCoupon: !!participation,
            canPlayToday: !!participation && !hasPlayedToday,
            hasPlayedToday,
            enteredIntoNextDraw,
            statusText: enteredIntoNextDraw ? "Joined Today's Lottery" : hasPlayedToday ? 'Already Played Today' : 'Ready to Play',
            coupenNumber: participation?.coupenNumber || null,
            nextEligiblePlayAt: hasPlayedToday ? this.getNextUtcMidnight(now) : null,
        };
    }

    async getAllParticipations() {
        return await this.carParticipationModel.find();
    }
}

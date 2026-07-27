import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from './schemas/car-participation.schema';
import { CarPlayEntry } from './schemas/car-play-entry.schema';
import { CarContribution } from '../car-contributions/schemas/car-contribution.schema';
import { UsersService } from '../users/users.service';
import { Model, Types } from 'mongoose';
import { CAR_PLANS, DEFAULT_CAR_PLAN_ID, getCarPlan, isValidCarPlanId } from './car-plans';

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
            // Users who opted out of the spinner draw can never win it (see
            // car-winner.service.ts's eligibleCoupons filter), so don't let them spend a
            // play entering a draw they have zero chance of winning.
            joinWithQurandazi: { $ne: false },
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

    // All 4 available car plans - exposed publicly so the join flow can show the user
    // full pricing information (daily/monthly amounts, target, post-win installment)
    // for each car before they choose one.
    getPlans() {
        return CAR_PLANS;
    }

    // referralCode is the referrer's shareable code (User.referralCode). referredByUserId
    // (a raw user id) is accepted too for backwards compatibility. planId picks which of
    // the 4 car plans (car-plans.ts) to join - defaults to Plan 1 if omitted, so existing
    // callers that don't send a plan keep behaving exactly as before.
    async join(userId: string, planId?: number, referralCode?: string, referredByUserId?: string, joinWithQurandazi: boolean = true) {
        const existingParticipation = await this.carParticipationModel.findOne({ userId });
        if (existingParticipation) {
            // A participation's plan is locked in forever at first join - calling join again
            // with a different planId does NOT create a second participation or switch plans.
            // Make that explicit instead of silently returning the old plan with no explanation.
            const planMismatch = planId !== undefined && planId !== existingParticipation.planId;
            return {
                message: planMismatch
                    ? `You already joined on ${getCarPlan(existingParticipation.planId).name}. A participation's plan can't be changed after joining, so Plan ${planId} was not applied.`
                    : "User has already joined",
                participationId: existingParticipation._id,
                planMismatch,
                coupen: existingParticipation.coupenNumber,
                planId: existingParticipation.planId,
                plan: getCarPlan(existingParticipation.planId),
            };
        }

        const resolvedPlanId = planId ?? DEFAULT_CAR_PLAN_ID;
        if (!isValidCarPlanId(resolvedPlanId)) {
            throw new BadRequestException(`Invalid plan selected. Choose a plan id between 1 and ${CAR_PLANS.length}.`);
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
        const participationData: any = { userId, coupenNumber, planId: resolvedPlanId, joinWithQurandazi };
        if (referrerId) {
            participationData.referredBy = new Types.ObjectId(referrerId);
        }
        const newParticipation = new this.carParticipationModel(participationData);
        await newParticipation.save();

        const plan = getCarPlan(resolvedPlanId);
        return {
            message: `User joined successfully on ${plan.name} (target PKR ${plan.targetAmount.toLocaleString()})`,
            participationId: newParticipation._id,
            coupen: coupenNumber,
            planId: resolvedPlanId,
            plan,
        };
    }

    async getParticipation(userId: string) {
        const participation = await this.carParticipationModel.findOne({ userId });
        if (!participation) {
            return null;
        }

        return {
            ...participation.toObject(),
            joinWithQurandazi: participation.joinWithQurandazi ?? true,
        };
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

        const pkrPerPlay = getCarPlan(participation.planId).pkrPerPlay;
        const now = new Date();
        const playDateKey = this.getUtcDateKey(now);

        const todaysContribution = await this.getTodaysContributionAmount(userId, now);
        const playsAvailableToday = Math.floor(todaysContribution / pkrPerPlay);
        const playsUsedToday = await this.carPlayEntryModel.countDocuments({
            userId: new Types.ObjectId(userId),
            playDateKey,
        });

        if (playsAvailableToday < 1) {
            throw new BadRequestException(`You need to contribute at least PKR ${pkrPerPlay} today before you can play. Make a payment first.`);
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
        const anyParticipation = await this.carParticipationModel.findOne({ userId });
        const hasJoinedScheme = !!anyParticipation;
        const pkrPerPlay = getCarPlan(anyParticipation?.planId).pkrPerPlay;
        const now = new Date();
        const playDateKey = this.getUtcDateKey(now);

        const todayEntries = await this.carPlayEntryModel.find({
            userId: new Types.ObjectId(userId),
            playDateKey,
        });

        const hasPlayedToday = todayEntries.length > 0;
        const enteredIntoNextDraw = todayEntries.some((entry) => entry.status === 'pending');
        const todaysContribution = await this.getTodaysContributionAmount(userId, now);
        const playsAvailableToday = Math.floor(todaysContribution / pkrPerPlay);
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
                    : `Contribute at least PKR ${pkrPerPlay} today to play`,
            coupenNumber: participation?.coupenNumber || null,
            planId: anyParticipation?.planId ?? null,
            nextEligiblePlayAt: canPlayToday ? null : this.getNextUtcMidnight(now),
        };
    }

    async getAllParticipations() {
        return await this.carParticipationModel.find();
    }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from './schemas/car-participation.schema';
import { CarPlayEntry } from './schemas/car-play-entry.schema';
import { CarContribution } from '../car-contributions/schemas/car-contribution.schema';
import { CarWinner } from '../car-winner/schemas/car-winner.schema';
import { CarRequest } from './schemas/car-request.schema';
import { UsersService } from '../users/users.service';
import { MailerService } from '../mailer/mailer.service';
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

    @InjectModel(CarWinner.name)
    private readonly carWinnerModel: Model<CarWinner>;

    @InjectModel(CarRequest.name)
    private readonly carRequestModel: Model<CarRequest>;

    constructor(
        private readonly usersService: UsersService,
        private readonly mailerService: MailerService,
    ) {}

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

        // Both paths must be validated identically - referredByUserId is a raw user id taken
        // directly from the request body, so without these same checks a caller could pass
        // their OWN userId to self-refer and farm the 20% referral bonus on their own
        // contributions forever, or pass a nonexistent id and have referral bonuses silently
        // vanish into an orphaned wallet for a "referrer" that doesn't exist.
        let referrerId: string | undefined;
        if (referralCode) {
            const referrer = await this.usersService.findByReferralCode(referralCode.trim().toUpperCase());
            if (!referrer) {
                throw new BadRequestException('Invalid referral code.');
            }
            if (referrer._id.toString() === userId) {
                throw new BadRequestException('You cannot refer yourself.');
            }
            referrerId = referrer._id.toString();
        } else if (referredByUserId) {
            if (referredByUserId === userId) {
                throw new BadRequestException('You cannot refer yourself.');
            }
            const referrer = await this.usersService.findById(referredByUserId);
            if (!referrer) {
                throw new BadRequestException('Invalid referrer.');
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

        if (referrerId) {
            // Keep the general User.referredBy link in sync with this car-specific one so
            // referral counts and the referrer card can be resolved reliably from the user
            // document as well as from the car participation record.
            await this.usersService.updateProfile(userId, { referredBy: new Types.ObjectId(referrerId) } as any);
        }

        const plan = getCarPlan(resolvedPlanId);
        return {
            message: `User joined successfully on ${plan.name} (target PKR ${plan.targetAmount.toLocaleString()})`,
            participationId: newParticipation._id,
            coupen: coupenNumber,
            planId: resolvedPlanId,
            plan,
        };
    }

    // Lets a user move to a different car plan mid-way through (e.g. Plan 1 -> Plan 3).
    // Only allowed while still PRE_WIN - once a car has been won or the plan fully paid
    // off, switching plans no longer means anything. totalPaid carries over unchanged, so
    // progress toward the new plan's threshold/target is recalculated from the same total.
    // Reaching/crossing the new plan's directAwardThreshold this way does NOT auto-award a
    // car (see requestCar()) - the user must submit a car request and have it approved,
    // same as reaching the threshold via a normal contribution.
    async switchPlan(userId: string, newPlanId: number) {
        if (!isValidCarPlanId(newPlanId)) {
            throw new BadRequestException(`Invalid plan selected. Choose a plan id between 1 and ${CAR_PLANS.length}.`);
        }

        const participation = await this.carParticipationModel.findOne({ userId });
        if (!participation) {
            throw new BadRequestException('You have not joined the car ownership scheme yet.');
        }

        if (participation.phase !== ParticipationPhase.PRE_WIN) {
            throw new BadRequestException('You can only switch plans before winning or completing your current plan.');
        }

        if (participation.planId === newPlanId) {
            throw new BadRequestException(`You are already on ${getCarPlan(newPlanId).name}.`);
        }

        const previousPlan = getCarPlan(participation.planId);
        const newPlan = getCarPlan(newPlanId);

        participation.planId = newPlanId;
        await participation.save();

        const thresholdReached = participation.totalPaid >= newPlan.directAwardThreshold;

        return {
            message: thresholdReached
                ? `Plan switched from ${previousPlan.name} to ${newPlan.name}. Your existing PKR ${participation.totalPaid.toLocaleString()} already meets ${newPlan.name}'s direct-award threshold (PKR ${newPlan.directAwardThreshold.toLocaleString()}) - you can now request your car.`
                : `Plan switched from ${previousPlan.name} to ${newPlan.name}.`,
            participation,
            previousPlan,
            plan: newPlan,
            thresholdReached,
        };
    }

    // ========== CAR REQUEST (claim) WORKFLOW ==========

    // User-side: submit a request to claim the car once totalPaid meets the plan's
    // directAwardThreshold. Does not award anything by itself - an admin must approve it.
    async requestCar(userId: string) {
        const participation = await this.carParticipationModel.findOne({ userId });
        if (!participation) {
            throw new BadRequestException('You have not joined the car ownership scheme yet.');
        }

        if (participation.carAwarded || participation.phase !== ParticipationPhase.PRE_WIN) {
            throw new BadRequestException('You are not eligible to request a car right now.');
        }

        const plan = getCarPlan(participation.planId);
        if (participation.totalPaid < plan.directAwardThreshold) {
            throw new BadRequestException(
                `You need to pay at least PKR ${plan.directAwardThreshold.toLocaleString()} to request your car. You have paid PKR ${participation.totalPaid.toLocaleString()} so far.`,
            );
        }

        const existingPending = await this.carRequestModel.findOne({
            carParticipationId: participation._id,
            status: 'pending',
        });
        if (existingPending) {
            throw new BadRequestException('You already have a pending car request.');
        }

        const request = new this.carRequestModel({
            carParticipationId: participation._id,
            userId: participation.userId,
            coupenNumber: participation.coupenNumber,
            planId: participation.planId,
            totalPaidAtRequest: participation.totalPaid,
            status: 'pending',
        });
        await request.save();

        return { message: 'Car request submitted. An admin will review it shortly.', request };
    }

    // User-side: view the status of their own (latest) car request.
    async getMyCarRequest(userId: string) {
        const participation = await this.carParticipationModel.findOne({ userId });
        if (!participation) {
            return null;
        }
        return this.carRequestModel
            .findOne({ carParticipationId: participation._id })
            .sort({ createdAt: -1 });
    }

    // Admin: pending requests awaiting review.
    async getPendingCarRequests() {
        return this.carRequestModel
            .find({ status: 'pending' })
            .populate('userId', 'name email phone')
            .sort({ createdAt: 1 });
    }

    // Admin: full request history.
    async getAllCarRequests() {
        return this.carRequestModel
            .find()
            .populate('userId', 'name email phone')
            .sort({ createdAt: -1 });
    }

    // Admin: approve - this is the only place a car actually gets awarded via the
    // threshold path now (mirrors the logic that used to run automatically on contribution).
    async approveCarRequest(requestId: string, adminId: string) {
        if (!Types.ObjectId.isValid(requestId)) {
            throw new BadRequestException('Invalid requestId.');
        }

        const request = await this.carRequestModel.findById(requestId);
        if (!request) throw new NotFoundException('Car request not found');
        if (request.status !== 'pending') throw new BadRequestException('Only pending requests can be approved');

        const participation = await this.carParticipationModel.findById(request.carParticipationId);
        if (!participation) throw new NotFoundException('Car participation not found');

        const plan = getCarPlan(participation.planId);

        if (!participation.carAwarded) {
            participation.carAwarded = true;
            participation.carAwardedDate = new Date();
            participation.phase = ParticipationPhase.POST_WIN;
            await participation.save();

            const winner = new this.carWinnerModel({
                carParticipationId: participation._id,
                userId: participation.userId,
                winningCoupen: participation.coupenNumber,
                winType: 'threshold',
                winningDate: new Date(),
            });
            await winner.save();

            const user = await this.usersService.findById(participation.userId.toString());
            if (user) {
                await this.mailerService.sendCarAwardEmail(user.email, user.name, 'direct');
            }
        }

        request.status = 'approved';
        request.reviewedBy = adminId;
        request.reviewedAt = new Date();
        await request.save();

        return {
            message: `Car request approved. Car awarded - monthly payment is now PKR ${plan.postWinMonthly.toLocaleString()}.`,
            request,
            participation,
        };
    }

    // Admin: reject - the user stays PRE_WIN and can submit a new request later.
    async rejectCarRequest(requestId: string, adminId: string, reason?: string) {
        if (!Types.ObjectId.isValid(requestId)) {
            throw new BadRequestException('Invalid requestId.');
        }

        const request = await this.carRequestModel.findById(requestId);
        if (!request) throw new NotFoundException('Car request not found');
        if (request.status !== 'pending') throw new BadRequestException('Only pending requests can be rejected');

        request.status = 'rejected';
        request.reviewedBy = adminId;
        request.reviewedAt = new Date();
        request.reviewNote = reason;
        await request.save();

        return { message: 'Car request rejected.', request };
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

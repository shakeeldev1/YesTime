import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from 'src/car-participation/schemas/car-participation.schema';
import { CarPlayEntry } from 'src/car-participation/schemas/car-play-entry.schema';
import { CarWinner } from './schemas/car-winner.schema';
import { SpinnerDraw } from './schemas/spinner-draw.schema';
import { User } from 'src/users/schemas/user.schema';
import { MailerService } from 'src/mailer/mailer.service';

@Injectable()
export class CarWinnerService {
    constructor(
        @InjectModel(CarParticipation.name) private carParticipationModel: Model<CarParticipation>,
        @InjectModel(CarPlayEntry.name) private carPlayEntryModel: Model<CarPlayEntry>,
        @InjectModel(CarWinner.name) private carWinnerModel: Model<CarWinner>,
        @InjectModel(SpinnerDraw.name) private spinnerDrawModel: Model<SpinnerDraw>,
        @InjectModel(User.name) private userModel: Model<User>,
        private mailerService: MailerService
    ) { }

    private generateRandom6DigitCoupon() {
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    // The shared draw-scheduler rotates 4 modules every minute (registration -> car ->
    // game -> cashback), so THIS module only actually draws once every 4 minutes, on
    // whichever future minute boundary lands on rotation slot 1. Must stay in sync with
    // the rotation order in draw-scheduler.service.ts.
    private readonly ROTATION_SLOT = 1;
    private readonly ROTATION_SIZE = 4;

    private computeNextDrawTime(now: Date): Date {
        const currentMinuteIndex = Math.floor(now.getTime() / 60000);
        const currentSlot = currentMinuteIndex % this.ROTATION_SIZE;
        let minutesUntil = (this.ROTATION_SLOT - currentSlot + this.ROTATION_SIZE) % this.ROTATION_SIZE;
        if (minutesUntil === 0) minutesUntil = this.ROTATION_SIZE;
        return new Date((currentMinuteIndex + minutesUntil) * 60000);
    }

    async spinAndSelectWinner() {
        const pendingPlayEntries = await this.carPlayEntryModel.find({ status: 'pending' });
        const drawDate = new Date();

        if (pendingPlayEntries.length === 0) {
            const winningCoupon = this.generateRandom6DigitCoupon();
            await this.spinnerDrawModel.deleteMany({});
            const spinnerDraw = new this.spinnerDrawModel({
                drawDate,
                winningCoupen: winningCoupon,
                status: 'completed',
                spinStartTime: drawDate,
                spinEndTime: new Date(),
            } as any);
            await spinnerDraw.save();
            return { message: 'No participants in this draw', winner: null, winningCoupon };
        }

        const eligibleParticipations = await this.carParticipationModel.find({
            status: ParticipationStatus.ACTIVE,
            phase: ParticipationPhase.PRE_WIN,
            hasWon: false,
            carAwarded: false,
            joinWithQurandazi: { $ne: false },
            coupenNumber: { $in: pendingPlayEntries.map((entry) => entry.coupenNumber) },
        }).populate('userId');

        const eligibleCoupons = new Set(eligibleParticipations.map((participant) => participant.coupenNumber));

        // Each pending play entry is one independent chance: draw a fresh random 6-digit
        // number for every entry and compare it against that entry's fixed coupon. More
        // plays purchased that day (PKR 50 = 1 play) means more independent draws this round.
        const shuffledEntries = [...pendingPlayEntries].sort(() => Math.random() - 0.5);

        let winningCoupon = '';
        let winnerCoupenNumber: string | null = null;
        const consumedIds = shuffledEntries.map((entry) => entry._id);

        for (const entry of shuffledEntries) {
            if (winnerCoupenNumber) continue; // car already awarded this round; just consume remaining plays
            if (!eligibleCoupons.has(entry.coupenNumber)) continue;

            const drawnNumber = this.generateRandom6DigitCoupon();
            winningCoupon = drawnNumber;
            if (entry.coupenNumber === drawnNumber) {
                winnerCoupenNumber = entry.coupenNumber;
            }
        }

        if (!winningCoupon) {
            winningCoupon = this.generateRandom6DigitCoupon();
        }

        const winner = winnerCoupenNumber
            ? eligibleParticipations.find((participant) => participant.coupenNumber === winnerCoupenNumber) || null
            : null;

        // Record only the latest spinner draw (delete previous to keep one document)
        const spinnerDoc = {
            drawDate,
            winningCoupen: winningCoupon,
            winnerId: winner ? winner.userId : undefined,
            status: 'completed',
            spinStartTime: drawDate,
            spinEndTime: new Date()
        } as any; // intentionally not storing drawNumber to save space

        // Remove old spinner draws and insert the latest one (keeps collection size to 1)
        await this.spinnerDrawModel.deleteMany({});
        const spinnerDraw = new this.spinnerDrawModel(spinnerDoc);
        await spinnerDraw.save();
        console.debug('[CarWinner] spinnerSaved (only latest kept)', { winningCoupen: spinnerDraw.winningCoupen, drawDate: spinnerDraw.drawDate });

        await this.carPlayEntryModel.updateMany(
            { _id: { $in: consumedIds }, status: 'pending' },
            { $set: { status: 'consumed', consumedAt: new Date(), consumedInDrawDate: drawDate } },
        );

        if (!winner) {
            return {
                message: 'No winner in this draw',
                winner: null,
                winningCoupon,
                totalPlaysThisRound: pendingPlayEntries.length,
            };
        }

        const previousWinnersCount = await this.carWinnerModel.countDocuments();
        const drawNumber = previousWinnersCount + 1;

        winner.hasWon = true;
        winner.carAwarded = true;
        winner.winDate = drawDate;
        winner.carAwardedDate = drawDate;
        winner.phase = ParticipationPhase.POST_WIN;
        await winner.save();

        const carWinner = new this.carWinnerModel({
            carParticipationId: winner._id,
            userId: winner.userId,
            winningCoupen: winner.coupenNumber,
            winType: 'spinner',
            winningDate: drawDate
        });
        await carWinner.save();

        // Send car award email to winner
        const winnerUser = await this.userModel.findById(winner.userId);
        if (winnerUser) {
            await this.mailerService.sendCarAwardEmail(winnerUser.email, winnerUser.name, 'lottery');
        }

        return {
            message: 'Winner selected successfully!',
            winner: {
                coupenNumber: winner.coupenNumber,
                userId: winner.userId,
                drawNumber,
            }
        };
    }

    async getNextDrawInfo() {
        const now = new Date();
        const nextDrawTime = this.computeNextDrawTime(now);
        const countdown = Math.max(0, Math.floor((nextDrawTime.getTime() - now.getTime()) / 1000));
        const totalWinners = await this.carWinnerModel.countDocuments();
        const latestWinner = await this.carWinnerModel.findOne().sort({ winningDate: -1 });

        // Prefer latest spinner draw (generated every minute) for lastDraw info
        const latestSpinner = await this.spinnerDrawModel.findOne().sort({ drawDate: -1 });

        const computeDrawNumberFromDate = (d: Date) => Math.floor(d.getTime() / 60000) % 1000000; // minute index mod 1e6

        let lastDraw: any = null;
        if (latestSpinner && latestSpinner.drawDate) {
            const winnerUser = latestSpinner.winnerId ? await this.userModel.findById(latestSpinner.winnerId) : null;
            lastDraw = {
                winningCoupen: latestSpinner.winningCoupen || null,
                drawDate: latestSpinner.drawDate || null,
                hasWinner: !!latestSpinner.winnerId,
                winnerName: winnerUser?.name || null,
            };
        } else if (latestWinner) {
            const winnerUser = await this.userModel.findById(latestWinner.userId);
            lastDraw = {
                winningCoupen: latestWinner.winningCoupen,
                drawDate: latestWinner.winningDate,
                hasWinner: true,
                winnerName: winnerUser?.name || null,
            };
        }

        console.debug('[CarWinner] getNextDrawInfo', { totalWinners, lastDrawExists: !!lastDraw });

        return {
            serverTime: now,
            nextDrawTime,
            countdown,
            drawNumber: computeDrawNumberFromDate(nextDrawTime) + 1,
            lastDraw,
        };
    }

    async getAllCarWinners() {
        return this.carWinnerModel.find()
            .populate('carParticipationId')
            .populate('userId')
            .sort({ winningDate: -1 });
    }

    async getDrawHistory(limit: number = 10) {
        return this.carWinnerModel.find()
            .populate('carParticipationId')
            .populate('userId')
            .sort({ winningDate: -1 })
            .limit(limit);
    }

    async getWinnerStats() {
        const totalWinners = await this.carWinnerModel.countDocuments();
        const spinnerWins = await this.carWinnerModel.countDocuments({ winType: 'spinner' });
        const thresholdWins = await this.carWinnerModel.countDocuments({ winType: 'threshold' });

        return {
            totalWinners,
            spinnerWins,
            thresholdWins,
            totalDraws: totalWinners
        };
    }
}

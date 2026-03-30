import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from 'src/car-participation/schemas/car-participation.schema';
import { CarWinner } from './schemas/car-winner.schema';
import { SpinnerDraw } from './schemas/spinner-draw.schema';
import { User } from 'src/users/schemas/user.schema';
import { MailerService } from 'src/mailer/mailer.service';

@Injectable()
export class CarWinnerService {
    constructor(
        @InjectModel(CarParticipation.name) private carParticipationModel: Model<CarParticipation>,
        @InjectModel(CarWinner.name) private carWinnerModel: Model<CarWinner>,
        @InjectModel(SpinnerDraw.name) private spinnerDrawModel: Model<SpinnerDraw>,
        @InjectModel(User.name) private userModel: Model<User>,
        private mailerService: MailerService
    ) { }

    private generateRandom6DigitCoupon() {
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    async spinAndSelectWinner() {
        const eligibleParticipations = await this.carParticipationModel.find({
            status: ParticipationStatus.ACTIVE,
            phase: ParticipationPhase.PRE_WIN,
            hasWon: false,
            carAwarded: false
        }).populate('userId');

        const drawDate = new Date();
        const winningCoupon = this.generateRandom6DigitCoupon();
        let winner: any = null;

        if (eligibleParticipations.length > 0) {
            winner = eligibleParticipations.find((participant) => participant.coupenNumber === winningCoupon) || null;
        }

        // Record only the latest spinner draw (delete previous to keep one document)
        const latestPrev = await this.spinnerDrawModel.findOne().sort({ drawDate: -1 });

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

        if (!winner) {
            return {
                message: 'No winner in this draw',
                winner: null,
                winningCoupon,
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
        const nextDrawTime = new Date(now);
        nextDrawTime.setSeconds(0, 0);
        nextDrawTime.setMinutes(now.getMinutes() + 1);
        const countdown = Math.max(0, Math.floor((nextDrawTime.getTime() - now.getTime()) / 1000));
        const totalWinners = await this.carWinnerModel.countDocuments();
        const latestWinner = await this.carWinnerModel.findOne().sort({ winningDate: -1 });

        // Prefer latest spinner draw (generated every minute) for lastDraw info
        const latestSpinner = await this.spinnerDrawModel.findOne().sort({ drawDate: -1 });

        const computeDrawNumberFromDate = (d: Date) => Math.floor(d.getTime() / 60000) % 1000000; // minute index mod 1e6

        let lastDraw: any = null;
        if (latestSpinner && latestSpinner.drawDate) {
            // Return only the last generated random coupon and its timestamp
            lastDraw = {
                winningCoupen: latestSpinner.winningCoupen || null,
                drawDate: latestSpinner.drawDate || null,
            };
        } else if (latestWinner) {
            lastDraw = {
                winningCoupen: latestWinner.winningCoupen,
                drawDate: latestWinner.winningDate,
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

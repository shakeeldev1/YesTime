import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from 'src/car-participation/schemas/car-participation.schema';
import { CarWinner } from './schemas/car-winner.schema';
import { User } from 'src/users/schemas/user.schema';
import { MailerService } from 'src/mailer/mailer.service';

@Injectable()
export class CarWinnerService {
    constructor(
        @InjectModel(CarParticipation.name) private carParticipationModel: Model<CarParticipation>,
        @InjectModel(CarWinner.name) private carWinnerModel: Model<CarWinner>,
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

        if (eligibleParticipations.length === 0) {
            return { message: 'No eligible participants for this draw', winner: null };
        }

        const winningCoupon = this.generateRandom6DigitCoupon();
        const winner = eligibleParticipations.find((participant) => participant.coupenNumber === winningCoupon);

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

        return {
            serverTime: now,
            nextDrawTime,
            countdown,
            drawNumber: totalWinners + 1,
            lastDraw: latestWinner
                ? {
                    drawNumber: totalWinners,
                    winningCoupen: latestWinner.winningCoupen,
                    drawDate: latestWinner.winningDate,
                }
                : null,
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

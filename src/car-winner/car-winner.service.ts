import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CarParticipation, ParticipationPhase, ParticipationStatus } from 'src/car-participation/schemas/car-participation.schema';
import { CarWinner } from './schemas/car-winner.schema';
import { SpinnerDraw } from './schemas/spinner-draw.schema';

@Injectable()
export class CarWinnerService {
    constructor(
        @InjectModel(CarParticipation.name) private carParticipationModel: Model<CarParticipation>,
        @InjectModel(CarWinner.name) private carWinnerModel: Model<CarWinner>,
        @InjectModel(SpinnerDraw.name) private spinnerDrawModel: Model<SpinnerDraw>
    ) { }

    async spinAndSelectWinner() {
        // Get all active participations that haven't won yet
        const eligibleParticipations = await this.carParticipationModel.find({
            status: ParticipationStatus.ACTIVE,
            phase: ParticipationPhase.PRE_WIN,
            hasWon: false,
            carAwarded: false
        }).populate('userId');

        const drawCount = await this.spinnerDrawModel.countDocuments();
        const drawDate = new Date();
        const drawNumber = drawCount + 1;

        if (eligibleParticipations.length === 0) {
            const draw = new this.spinnerDrawModel({
                drawNumber,
                drawDate,
                status: 'completed',
                spinStartTime: new Date(drawDate.getTime() - 10000),
                spinEndTime: drawDate
            });
            await draw.save();
            return { message: 'No eligible participants for this draw', winner: null };
        }

        // Random winner selection
        const randomIndex = Math.floor(Math.random() * eligibleParticipations.length);
        const winner = eligibleParticipations[randomIndex];

        // Update participation
        winner.hasWon = true;
        winner.carAwarded = true;
        winner.winDate = drawDate;
        winner.carAwardedDate = drawDate;
        winner.phase = ParticipationPhase.POST_WIN;
        await winner.save();

        // Create winner record
        const carWinner = new this.carWinnerModel({
            carParticipationId: winner._id,
            userId: winner.userId,
            winningCoupen: winner.coupenNumber,
            winType: 'spinner',
            winningDate: drawDate
        });
        await carWinner.save();

        // Create draw record
        const draw = new this.spinnerDrawModel({
            drawNumber,
            drawDate,
            winningCoupen: winner.coupenNumber,
            winnerId: winner.userId,
            status: 'completed',
            spinStartTime: new Date(drawDate.getTime() - 10000),
            spinEndTime: drawDate
        });
        await draw.save();

        return {
            message: 'Winner selected successfully!',
            winner: {
                coupenNumber: winner.coupenNumber,
                userId: winner.userId,
                drawNumber: draw.drawNumber
            }
        };
    }

    async getNextDrawInfo() {
        const now = new Date();
        const lastDraw = await this.spinnerDrawModel.findOne().sort({ drawNumber: -1 });

        if (!lastDraw) {
            const nextDrawTime = new Date(now);
            nextDrawTime.setSeconds(0, 0);
            nextDrawTime.setMinutes(now.getMinutes() + 1);

            const countdown = Math.max(0, Math.floor((nextDrawTime.getTime() - now.getTime()) / 1000));

            return {
                serverTime: now,
                nextDrawTime,
                countdown,
                drawNumber: 1
            };
        }

        const nextDrawTime = new Date(lastDraw.drawDate.getTime() + 60000); // 1 minute after last draw
        const countdown = Math.max(0, Math.floor((nextDrawTime.getTime() - now.getTime()) / 1000));

        return {
            serverTime: now,
            nextDrawTime,
            countdown,
            drawNumber: lastDraw.drawNumber + 1,
            lastDraw: {
                drawNumber: lastDraw.drawNumber,
                winningCoupen: lastDraw.winningCoupen,
                drawDate: lastDraw.drawDate
            }
        };
    }

    async getAllCarWinners() {
        return this.carWinnerModel.find()
            .populate('carParticipationId')
            .populate('userId')
            .sort({ winningDate: -1 });
    }

    async getDrawHistory(limit: number = 10) {
        return this.spinnerDrawModel.find()
            .populate('winnerId')
            .sort({ drawNumber: -1 })
            .limit(limit);
    }

    async getWinnerStats() {
        const totalWinners = await this.carWinnerModel.countDocuments();
        const spinnerWins = await this.carWinnerModel.countDocuments({ winType: 'spinner' });
        const thresholdWins = await this.carWinnerModel.countDocuments({ winType: 'threshold' });
        const totalDraws = await this.spinnerDrawModel.countDocuments();

        return {
            totalWinners,
            spinnerWins,
            thresholdWins,
            totalDraws
        };
    }
}

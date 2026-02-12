import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CarParticipation } from 'src/car-participation/schemas/car-participation.schema';
import { CarWinner } from './schemas/car-winner.schema';

@Injectable()
export class CarWinnerService {
    constructor(
        @InjectModel(CarParticipation.name) private carParticipationModel:Model<CarParticipation>,
        @InjectModel(CarWinner.name) private carWinnerModel:Model<CarWinner>
    ) {}

    async addCarWinner(winningCoupen:string){
        const participation = await this.carParticipationModel.findOne({coupen: winningCoupen});
        if(!participation){
            throw new Error('Invalid coupen code');
        }
        const winner = new this.carWinnerModel({ coupen: winningCoupen });
        return winner.save();
    }

    async getAllCarWinners(){
        return this.carWinnerModel.find().populate('carParticipationId');
    }
}

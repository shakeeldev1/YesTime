import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CarParticipation } from './schemas/car-participation.schema';
import { Model } from 'mongoose';

@Injectable()
export class CarParticipationService {
    @InjectModel(CarParticipation.name)
    private readonly carParticipationModel: Model<CarParticipation>;

    // 6 digit unique coupen code generator
    private async generateUniqueCoupen() {
        let coupen = Math.floor(100000 + Math.random() * 900000).toString();
        while (await this.carParticipationModel.findOne({ coupen })) {
            coupen = Math.floor(100000 + Math.random() * 900000).toString();
        }
        return coupen;
    }

    async join(userId: string) {
        const existingParticipation = await this.carParticipationModel.findOne({ userId });
        if (existingParticipation) {
            return { message: "User has already joined", coupen: existingParticipation.coupenNumber };
        }
        const coupenNumber = await this.generateUniqueCoupen();
        const newParticipation = new this.carParticipationModel({ userId, coupenNumber });
        await newParticipation.save();
        return { message: "User joined successfully", coupen: coupenNumber };
    }

    async getParticipation(userId: string) {
        return await this.carParticipationModel.findOne({ userId });
    }

    async getAllParticipations() {
        return await this.carParticipationModel.find();
    }
}

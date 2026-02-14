import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({timestamps:true})
export class CarWinner {
    
    @Prop({required:true, type:Types.ObjectId, ref:'CarParticipation'})
    carParticipationId!: Types.ObjectId;

    @Prop({required:true, type:Types.ObjectId, ref:'User'})
    userId!: Types.ObjectId;

    @Prop({required:true})
    winningCoupen!: string;

    @Prop()
    winningDate: Date = new Date();

    @Prop({required:true, enum: ['spinner', 'threshold']})
    winType!: string; // 'spinner' for lottery win, 'threshold' for 546000 auto award
}

export const CarWinnerSchema = SchemaFactory.createForClass(CarWinner);
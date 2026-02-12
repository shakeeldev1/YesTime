import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({timestamps:true})
export class CarContribution {
    @Prop({ required: true, type: Types.ObjectId, ref: 'CarParticipation' })
    carParticipationId!: Types.ObjectId;

    @Prop({required:true,type:Types.ObjectId,ref:'User'})
    userId!: Types.ObjectId;

    @Prop({required:true})
    amount!: number;

    @Prop()
    date: Date = new Date();
}

export const CarContributionSchema = SchemaFactory.createForClass(CarContribution);
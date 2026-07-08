import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schema as MongooseSchema, Types } from "mongoose";

@Schema({timestamps:true})
export class CarContribution {
    @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'CarParticipation' })
    carParticipationId!: Types.ObjectId;

    @Prop({required:true,type:MongooseSchema.Types.ObjectId,ref:'User'})
    userId!: Types.ObjectId;

    @Prop({required:true})
    amount!: number;

    @Prop()
    date: Date = new Date();
}

export const CarContributionSchema = SchemaFactory.createForClass(CarContribution);
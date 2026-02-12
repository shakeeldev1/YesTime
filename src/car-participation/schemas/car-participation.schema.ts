import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({timestamps:true})
export class CarParticipation {
    @Prop({required:true,type:Types.ObjectId,ref:'User'})
    userId!: Types.ObjectId;

    @Prop({required:true,unique:true})
    coupenNumber!: number;

    @Prop({default:0})
    totalPaid!: number;

    @Prop({default:false})
    hasWon!: boolean;

    @Prop({default:'active'})
    status!: string;
}

export const CarParticipationSchema = SchemaFactory.createForClass(CarParticipation);
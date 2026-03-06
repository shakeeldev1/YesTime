import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

export enum ParticipationPhase {
    PRE_WIN = 'pre-win', // Paying 50-1500/day
    POST_WIN = 'post-win', // Paying 36000/month after winning/direct car
    COMPLETED = 'completed' // Fully paid 3000000
}

export enum ParticipationStatus {
    ACTIVE = 'active',
    SUSPENDED = 'suspended',
    COMPLETED = 'completed'
}

@Schema({timestamps:true})
export class CarParticipation {
    @Prop({required:true,type:Types.ObjectId,ref:'User'})
    userId!: Types.ObjectId;

    @Prop({required:true,unique:true})
    coupenNumber!: string;

    @Prop({default:0})
    totalPaid!: number;

    @Prop({default:false})
    hasWon!: boolean;

    @Prop({default:false})
    carAwarded!: boolean;

    @Prop({type:String, enum: ParticipationPhase, default: ParticipationPhase.PRE_WIN})
    phase!: ParticipationPhase;

    @Prop({type:String, enum: ParticipationStatus, default: ParticipationStatus.ACTIVE})
    status!: ParticipationStatus;

    @Prop()
    lastPaymentDate?: Date;

    @Prop()
    carAwardedDate?: Date;

    @Prop()
    winDate?: Date;

    // Referral tracking
    @Prop({ type: Types.ObjectId, ref: 'User' })
    referredBy?: Types.ObjectId;
}

export const CarParticipationSchema = SchemaFactory.createForClass(CarParticipation);
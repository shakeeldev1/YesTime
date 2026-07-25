import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schema as MongooseSchema, Types } from "mongoose";

export enum ParticipationPhase {
    PRE_WIN = 'pre-win', // Paying the plan's daily contribution range (see car-plans.ts)
    POST_WIN = 'post-win', // Paying the plan's monthly amount after winning/direct car award
    COMPLETED = 'completed' // Fully paid the plan's target amount
}

export enum ParticipationStatus {
    ACTIVE = 'active',
    SUSPENDED = 'suspended',
    COMPLETED = 'completed'
}

@Schema({timestamps:true})
export class CarParticipation {
    @Prop({required:true,type:MongooseSchema.Types.ObjectId,ref:'User'})
    userId!: Types.ObjectId;

    @Prop({required:true,unique:true})
    coupenNumber!: string;

    // Which of the 4 car plans (see car-plans.ts) this participation is contributing toward.
    // Defaults to 1 (the original/only plan) so pre-existing participations behave unchanged.
    @Prop({required:true,default:1,min:1,max:4})
    planId!: number;

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
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
    referredBy?: Types.ObjectId;

    // Whether this participation should be included in future qurandazi/spinner draws.
    // Defaults to true for backward compatibility with older records that predate this flag.
    @Prop({ default: true })
    joinWithQurandazi!: boolean;
}

export const CarParticipationSchema = SchemaFactory.createForClass(CarParticipation);
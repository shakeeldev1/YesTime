import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class GameCycle extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, unique: true })
  couponNumber!: string;

  @Prop({ required: true })
  tokenNumber!: string;

  @Prop({ required: true })
  cycleDate!: number;

  @Prop({ default: 0 })
  totalInvested!: number;

  @Prop({ default: 1000 })
  currentReward!: number;

  @Prop({ default: 0 })
  totalWins!: number;

  @Prop({ default: 0 })
  totalLosses!: number;

  @Prop()
  lastPlayedMonth?: number;

  @Prop()
  lastPlayedYear?: number;

  @Prop({ default: false })
  autoJoinEnabledForCurrentCycle!: boolean;

  @Prop({ default: false })
  hasPlayedCurrentCycle!: boolean;

  @Prop({ default: 0 })
  playsUsedThisCycle!: number;

  @Prop({ default: false })
  queuedForNextRound!: boolean;

  @Prop()
  lastParticipatedAt?: Date;

  @Prop()
  nextEligiblePlayDate?: Date;

  @Prop({ required: true, default: 1 })
  currentDay!: number;

  @Prop({ required: true, default: 0 })
  totalSavings!: number;

  @Prop({ required: true, default: 50 })
  dailyAmount!: number;

  @Prop({ required: true, default: 30 })
  cycleDays!: number;

  @Prop({ required: true, default: 'active', enum: ['active', 'completed', 'won'] })
  status!: string;

  @Prop({ required: true })
  cycleStartDate!: Date;

  @Prop()
  cycleEndDate!: Date;

  @Prop({ default: false })
  isPermanent!: boolean;

  @Prop({ default: 0 })
  permanentPrizeAmount!: number;

  @Prop({ default: 'none' })
  participationMode!: string;

  @Prop()
  lastPaymentDate!: Date;

  @Prop({ type: [Date], default: [] })
  paymentDates!: Date[];
}

export const GameCycleSchema = SchemaFactory.createForClass(GameCycle);

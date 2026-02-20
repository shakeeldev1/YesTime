import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class GameCycle extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, unique: true })
  couponNumber!: string;

  @Prop({ required: true, default: 1 })
  currentDay!: number;

  @Prop({ required: true, default: 0 })
  totalSavings!: number;

  @Prop({ required: true, default: 25 })
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

  @Prop()
  lastPaymentDate!: Date;

  @Prop({ type: [Date], default: [] })
  paymentDates!: Date[];
}

export const GameCycleSchema = SchemaFactory.createForClass(GameCycle);

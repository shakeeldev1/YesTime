import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class GamePayment extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop()
  tokenId?: string;

  @Prop({ required: true })
  cycleId!: string;

  @Prop({ required: true })
  couponNumber!: string;

  @Prop()
  tokenNumber?: string;

  @Prop()
  cycleDate?: number;

  @Prop({ required: true, default: 50 })
  amount!: number;

  @Prop({ required: true })
  dayNumber!: number;

  @Prop({ default: 'investment' })
  action!: string;

  @Prop({ default: 'manual' })
  participationMode!: string;

  @Prop({ default: 0 })
  rewardAmount!: number;

  @Prop({ required: true })
  paymentDate!: Date;

  @Prop({ required: true, default: 'completed', enum: ['pending', 'completed', 'failed'] })
  status!: string;
}

export const GamePaymentSchema = SchemaFactory.createForClass(GamePayment);

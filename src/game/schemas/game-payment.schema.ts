import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class GamePayment extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  cycleId!: string;

  @Prop({ required: true })
  couponNumber!: string;

  @Prop({ required: true, default: 25 })
  amount!: number;

  @Prop({ required: true })
  dayNumber!: number;

  @Prop({ required: true })
  paymentDate!: Date;

  @Prop({ required: true, default: 'completed', enum: ['pending', 'completed', 'failed'] })
  status!: string;
}

export const GamePaymentSchema = SchemaFactory.createForClass(GamePayment);

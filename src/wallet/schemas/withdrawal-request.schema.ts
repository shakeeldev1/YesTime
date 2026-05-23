import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WithdrawalRequestStatus = 'pending' | 'paid' | 'rejected';

@Schema({ timestamps: true })
export class WithdrawalRequest extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true })
  withdrawalMethod!: string;

  @Prop({ required: true })
  accountTitle!: string;

  @Prop({ required: true })
  accountNumber!: string;

  @Prop()
  bankName?: string;

  @Prop()
  note?: string;

  @Prop({ enum: ['pending', 'paid', 'rejected'], default: 'pending' })
  status!: WithdrawalRequestStatus;

  @Prop()
  reviewedBy?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  reviewNote?: string;

  @Prop()
  paidAt?: Date;
}

export const WithdrawalRequestSchema = SchemaFactory.createForClass(WithdrawalRequest);
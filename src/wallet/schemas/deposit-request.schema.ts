import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DepositRequestStatus = 'pending' | 'approved' | 'rejected';

@Schema({ timestamps: true })
export class DepositRequest extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true })
  paymentMethod!: string;

  @Prop({ required: true })
  senderName!: string;

  @Prop()
  transactionReference?: string;

  @Prop()
  bankName?: string;

  @Prop({ required: true })
  paymentScreenshotUrl!: string;

  @Prop()
  note?: string;

  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status!: DepositRequestStatus;

  @Prop()
  reviewedBy?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  reviewNote?: string;
}

export const DepositRequestSchema = SchemaFactory.createForClass(DepositRequest);

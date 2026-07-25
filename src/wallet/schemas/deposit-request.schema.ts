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

  @Prop({ required: true })
  transactionReference!: string;

  @Prop()
  bankName?: string;

  @Prop({ required: true })
  paymentScreenshotUrl!: string;

  @Prop()
  ocrRawText?: string;

  @Prop()
  ocrParsedTransactionReference?: string;

  @Prop()
  ocrParsedAmount?: number;

  @Prop()
  ocrParsedDate?: Date;

  @Prop()
  ocrParsedReceiver?: string;

  @Prop()
  ocrParsedBankName?: string;

  @Prop({ default: false })
  ocrVerified!: boolean;

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

// A payment ID (transactionReference) can only back one non-rejected deposit request at a time,
// preventing the same screenshot/payment ID from being reused to claim multiple credits.
DepositRequestSchema.index(
  { transactionReference: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: 'rejected' } } },
);

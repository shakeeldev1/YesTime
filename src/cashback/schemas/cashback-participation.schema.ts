import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class CashbackParticipation extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  customerId!: Types.ObjectId;

  @Prop({ required: true })
  playDateKey!: string;

  @Prop({ required: true })
  couponNumber!: string;

  @Prop({ default: 'pending', enum: ['pending', 'consumed'] })
  status!: string;

  @Prop({ required: true })
  enteredAt!: Date;

  @Prop()
  consumedAt?: Date;

  @Prop()
  drawNumber?: number;

  createdAt!: Date;

  updatedAt!: Date;
}

export const CashbackParticipationSchema = SchemaFactory.createForClass(CashbackParticipation);
// One entry per coupon per day - NOT per customer per day, since a customer can hold several
// eligible coupons at once (old permanent ones plus a new active cycle) and each plays independently.
CashbackParticipationSchema.index({ customerId: 1, playDateKey: 1, couponNumber: 1 }, { unique: true });
CashbackParticipationSchema.index({ status: 1, playDateKey: 1 });
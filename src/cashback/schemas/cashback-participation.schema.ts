import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class CashbackParticipation extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
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
}

export const CashbackParticipationSchema = SchemaFactory.createForClass(CashbackParticipation);
CashbackParticipationSchema.index({ customerId: 1, playDateKey: 1 }, { unique: true });
CashbackParticipationSchema.index({ status: 1, playDateKey: 1 });
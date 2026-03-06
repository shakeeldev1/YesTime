import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class RegistrationLottery extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  couponNumber!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: 0 })
  totalWinnings!: number;

  @Prop({ default: 0 })
  winCount!: number;
}

export const RegistrationLotterySchema = SchemaFactory.createForClass(RegistrationLottery);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class RegistrationLottery extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  couponNumber!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: 0 })
  totalWinnings!: number;

  @Prop({ default: 0 })
  winCount!: number;

  @Prop()
  lastPlayedAt?: Date;

  // True once the user has opted in ("played") for today and until the next draw consumes it.
  @Prop({ default: false })
  pendingDraw!: boolean;
}

export const RegistrationLotterySchema = SchemaFactory.createForClass(RegistrationLottery);

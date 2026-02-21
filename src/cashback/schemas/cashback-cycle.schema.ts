import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class CashbackCycle extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  customerId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  couponNumber!: string;

  @Prop({ default: 0 })
  totalShopping!: number;

  @Prop({ default: 0 })
  currentLevel!: number;

  @Prop({ default: 0 })
  totalCommitted!: number;

  @Prop({ default: 0 })
  remaining!: number;

  @Prop({ default: 'active', enum: ['active', 'won', 'completed'] })
  status!: string;

  @Prop({ default: false })
  isPermanent!: boolean;

  @Prop()
  cycleStartDate!: Date;

  @Prop()
  wonDate?: Date;

  @Prop({ default: 0 })
  wonAmount!: number;
}

export const CashbackCycleSchema = SchemaFactory.createForClass(CashbackCycle);

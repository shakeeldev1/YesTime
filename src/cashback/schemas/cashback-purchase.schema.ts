import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class CashbackPurchase extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  customerId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Shopkeeper' })
  shopkeeperId!: Types.ObjectId;

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true })
  commissionAmount!: number;

  @Prop({ required: true })
  customerCoupon!: string;

  @Prop()
  description?: string;

  @Prop({ default: 'completed', enum: ['pending', 'completed'] })
  status!: string;
}

export const CashbackPurchaseSchema = SchemaFactory.createForClass(CashbackPurchase);

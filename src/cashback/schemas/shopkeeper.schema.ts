import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Shopkeeper extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  shopName!: string;

  @Prop({ required: true })
  ownerName!: string;

  @Prop({ required: true })
  phone!: string;

  @Prop()
  address?: string;

  @Prop()
  shopType?: string;

  @Prop()
  shopDescription?: string;

  @Prop({ default: false })
  isRegistrationPaid!: boolean;

  @Prop({ default: 0 })
  totalSales!: number;

  @Prop({ default: 0 })
  totalCommissionPaid!: number;

  @Prop({ default: 'pending', enum: ['pending', 'active', 'suspended', 'inactive', 'rejected'] })
  status!: string;

  @Prop()
  couponNumber?: string;
}

export const ShopkeeperSchema = SchemaFactory.createForClass(Shopkeeper);

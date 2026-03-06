import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export enum UserRole {
  USER = 'user',
  SHOPKEEPER = 'shopkeeper',
  ADMIN = 'admin',
}

@Schema({ timestamps: true })
export class User extends Document {

  @Prop({ required: true })
  name!: string;

  @Prop({ unique: true, required: true })
  email!: string;

  @Prop({ required: true, unique: true })
  phone!: string;

  @Prop({ default: false })
  isPhoneVerified!: boolean;

  @Prop({ enum: UserRole, default: UserRole.USER })
  role!: string;

  @Prop()
  refreshToken?: string;

  @Prop()
  otp?: string;

  @Prop({ required: true })
  password!: string;

  @Prop()
  cnicFrontImage?: string;

  @Prop()
  cnicBackImage?: string;

  @Prop()
  profileImage?: string;

  // Registration fee & coupon
  @Prop({ default: false })
  registrationFeePaid!: boolean;

  @Prop()
  registrationCoupon?: string;

  // Referral system for car dashboard
  @Prop({ unique: true, sparse: true })
  referralCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  referredBy?: Types.ObjectId;

  @Prop({ default: 0 })
  totalReferralEarnings!: number;

  // Shopkeeper application info (stored here for role selection flow)
  @Prop()
  shopName?: string;

  @Prop()
  shopLocation?: string;

  @Prop()
  shopType?: string;

  @Prop()
  shopDescription?: string;

  @Prop({ default: 'none', enum: ['none', 'pending', 'approved', 'rejected'] })
  shopkeeperStatus!: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
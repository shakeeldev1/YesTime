import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

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
}

export const UserSchema = SchemaFactory.createForClass(User);
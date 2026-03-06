import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class RegistrationNotification extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, enum: ['REGISTRATION', 'DRAW', 'WIN', 'SYSTEM'] })
  category!: string;

  @Prop({ default: false })
  isRead!: boolean;
}

export const RegistrationNotificationSchema = SchemaFactory.createForClass(RegistrationNotification);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class CashbackNotification extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, enum: ['SHOPPING', 'DRAW', 'WIN', 'SYSTEM'] })
  category!: string;

  @Prop({ default: false })
  isRead!: boolean;
}

export const CashbackNotificationSchema = SchemaFactory.createForClass(CashbackNotification);

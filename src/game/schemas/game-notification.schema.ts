import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class GameNotification extends Document {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, enum: ['GAME', 'SAVINGS', 'SECURITY', 'WIN'] })
  category!: string;

  @Prop({ default: false })
  isRead!: boolean;
}

export const GameNotificationSchema = SchemaFactory.createForClass(GameNotification);

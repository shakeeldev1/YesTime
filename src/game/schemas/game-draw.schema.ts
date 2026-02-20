import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class GameDraw extends Document {
  @Prop({ required: true })
  drawNumber!: number;

  @Prop({ required: true })
  winningNumber!: string;

  @Prop()
  winnerUserId?: string;

  @Prop()
  winnerCoupon?: string;

  @Prop({ required: true, default: 0 })
  prizeAmount!: number;

  @Prop({ required: true, default: 0 })
  totalParticipants!: number;

  @Prop({ required: true })
  drawDate!: Date;

  @Prop({ required: true, default: 'completed', enum: ['scheduled', 'completed', 'cancelled'] })
  status!: string;
}

export const GameDrawSchema = SchemaFactory.createForClass(GameDraw);

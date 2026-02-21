import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class CashbackDraw extends Document {
  @Prop({ required: true })
  drawNumber!: number;

  @Prop({ required: true })
  winningNumber!: string;

  @Prop()
  winnerUserId?: string;

  @Prop()
  winnerCoupon?: string;

  @Prop({ default: 0 })
  prizeAmount!: number;

  @Prop({ default: 0 })
  totalParticipants!: number;

  @Prop({ required: true })
  drawDate!: Date;

  @Prop({ default: 'completed', enum: ['scheduled', 'completed', 'cancelled'] })
  status!: string;
}

export const CashbackDrawSchema = SchemaFactory.createForClass(CashbackDraw);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

// A user's formal request to claim their car once they've reached their plan's
// directAwardThreshold. Reaching the threshold no longer auto-awards the car - an admin
// must approve this request first (mirrors the deposit/withdrawal request pattern).
@Schema({ timestamps: true })
export class CarRequest extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'CarParticipation' })
  carParticipationId!: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  coupenNumber!: string;

  @Prop({ required: true })
  planId!: number;

  // Snapshot of totalPaid at request time, for admin visibility - totalPaid itself may
  // keep growing (daily contributions continue) while the request is pending.
  @Prop({ required: true })
  totalPaidAtRequest!: number;

  @Prop({ required: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status!: string;

  @Prop()
  reviewedBy?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  reviewNote?: string;
}

export const CarRequestSchema = SchemaFactory.createForClass(CarRequest);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class CarPlayEntry extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  coupenNumber!: string;

  @Prop({ required: true })
  playDateKey!: string;

  @Prop({ required: true, enum: ['pending', 'consumed'], default: 'pending' })
  status!: string;

  @Prop({ required: true })
  enteredAt!: Date;

  @Prop()
  consumedAt?: Date;

  @Prop()
  consumedInDrawDate?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CarPlayEntrySchema = SchemaFactory.createForClass(CarPlayEntry);
// Not unique: a user can hold multiple play entries for the same day when their
// daily contribution amount buys more than one play (PKR 50 = 1 play).
CarPlayEntrySchema.index({ userId: 1, playDateKey: 1 });
CarPlayEntrySchema.index({ status: 1, playDateKey: 1 });

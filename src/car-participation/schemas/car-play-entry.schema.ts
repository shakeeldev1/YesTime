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
CarPlayEntrySchema.index({ userId: 1, playDateKey: 1 }, { unique: true });
CarPlayEntrySchema.index({ status: 1, playDateKey: 1 });

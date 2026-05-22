import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class EventMediaAsset {
  @Prop({ required: true })
  url!: string;

  @Prop({ required: true })
  publicId!: string;

  @Prop({ required: true, enum: ['image', 'video', 'raw'] })
  resourceType!: string;

  @Prop()
  caption?: string;

  @Prop()
  title?: string;
}

const EventMediaAssetSchema = SchemaFactory.createForClass(EventMediaAsset);

@Schema({ timestamps: true })
export class Event extends Document {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, unique: true, trim: true, index: true })
  slug!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, type: EventMediaAssetSchema })
  coverImage!: EventMediaAsset;

  @Prop({ type: [EventMediaAssetSchema], default: [] })
  media!: EventMediaAsset[];

  @Prop({ required: true })
  eventDate!: Date;

  @Prop()
  location?: string;

  @Prop({ default: 'draft', enum: ['draft', 'published'] })
  status!: string;

  @Prop()
  publishAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const EventSchema = SchemaFactory.createForClass(Event);
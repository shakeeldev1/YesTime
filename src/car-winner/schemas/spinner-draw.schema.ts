import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({timestamps:true})
export class SpinnerDraw {
    @Prop({required:true})
    drawNumber!: number;

    @Prop({required:true})
    drawDate!: Date;

    @Prop()
    winningCoupen?: string;

    @Prop({type:Types.ObjectId, ref:'User'})
    winnerId?: Types.ObjectId;

    @Prop({default: 'completed'})
    status!: string; // 'scheduled', 'spinning', 'completed'

    @Prop()
    spinStartTime?: Date;

    @Prop()
    spinEndTime?: Date;
}

export const SpinnerDrawSchema = SchemaFactory.createForClass(SpinnerDraw);

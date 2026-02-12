import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({timestamps:true})
export class CarWinner {
    @Prop({required:true})
    coupenNumber: string;

    @Prop()
    winningDate: Date = new Date();
}

export const CarWinnerSchema = SchemaFactory.createForClass(CarWinner);
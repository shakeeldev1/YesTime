import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({timestamps:true})
export class CarWinner {
    
    @Prop({required:true})
    winningCoupen!: string;

    @Prop()
    winningDate: Date = new Date();
}

export const CarWinnerSchema = SchemaFactory.createForClass(CarWinner);
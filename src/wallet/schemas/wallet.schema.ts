import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ timestamps: true })
export class Wallet {
    @Prop({ required: true, unique: true })
    userId: string ;

    @Prop({ default: 0 })
    balance: number ;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({timestamps:true})
export class Transaction {
    @Prop({required:true})
    userId: string;

    @Prop({required:true,enum:['credit','debit']})
    type: string;

    @Prop({required:true})
    amount: number;

    @Prop()
    description?: string;

    @Prop({ default: 'completed' })
    status?: string;
    
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
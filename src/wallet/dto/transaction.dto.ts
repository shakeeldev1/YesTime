import { IsIn, IsNumberString, IsOptional } from "class-validator";

export class GetTransactionsDto{
    @IsOptional()
    @IsNumberString()
    userId?: string;

    @IsOptional()
    @IsNumberString()
    limit?: number;

    @IsOptional()
    @IsIn(['credit', 'debit'])
    type?: string;

    @IsOptional()
    from?: string;

    @IsOptional()
    to?: string;
}
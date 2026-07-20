import { IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateDepositRequestDto {
  @IsNumberString()
  amount: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @IsString()
  @IsNotEmpty()
  senderName: string;

  @IsString()
  @IsNotEmpty()
  transactionReference: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

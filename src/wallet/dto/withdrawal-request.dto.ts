import { IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateWithdrawalRequestDto {
  @IsNumberString()
  amount!: string;

  @IsString()
  @IsNotEmpty()
  withdrawalMethod!: string;

  @IsString()
  @IsNotEmpty()
  accountTitle!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
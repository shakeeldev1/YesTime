import { IsOptional, IsNumber, IsString } from 'class-validator';

export class DailyPaymentDto {
  // No body needed - uses wallet balance and current cycle
}

export class GetGameHistoryDto {
  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  page?: number;
}

export class GetDrawHistoryDto {
  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

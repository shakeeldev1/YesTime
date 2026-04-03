import { IsString, IsNumber, IsOptional, Min, IsMongoId } from 'class-validator';

export class RegisterShopkeeperDto {
  @IsString()
  shopName!: string;

  @IsString()
  ownerName!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class RecordPurchaseDto {
  @IsOptional()
  @IsMongoId()
  shopkeeperId?: string;

  @IsString()
  customerCoupon!: string;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

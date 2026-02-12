import { IsMongoId, IsNumber, Min } from "class-validator";

export class CarContributionDto {
    @IsMongoId()
    participationId!: string;

    @IsNumber()
    @Min(0)
    amount!: number;
}
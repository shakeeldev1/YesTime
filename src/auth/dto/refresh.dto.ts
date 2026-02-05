import { IsString } from "class-validator";

export class refreshTokenDto {
    @IsString()
    refreshToken: string;
}
import { IsEmail, IsOptional, IsString } from "class-validator";
export class SignupDto{
    @IsString()
    name:string;

    @IsEmail()
    email:string;

    @IsString()
    phone:string;

    @IsString()
    password:string;

    @IsOptional()
    @IsString()
    cnicFrontImage?: string;

    @IsOptional()
    @IsString()
    cnicBackImage?: string;
}
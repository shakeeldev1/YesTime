import { IsEmail, IsOptional, IsString } from "class-validator";
export class SignupDto{
    @IsString()
    name:string;

    @IsOptional()
    @IsEmail()
    email:string;

    @IsString()
    phone:string;

    @IsString()
    password:string;
}
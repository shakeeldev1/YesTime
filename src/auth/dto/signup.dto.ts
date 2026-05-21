import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from "class-validator";
export class SignupDto{
    @IsString()
    @IsNotEmpty()
    name:string;

    @IsEmail()
    email:string;

    @IsString()
    @IsNotEmpty()
    phone:string;

    @IsString()
    @MinLength(8)
    @Matches(/(?=.*[a-z])/, { message: 'Password must include at least one lowercase letter' })
    @Matches(/(?=.*[A-Z])/, { message: 'Password must include at least one uppercase letter' })
    @Matches(/(?=.*[^A-Za-z0-9])/, { message: 'Password must include at least one special character' })
    password:string;

    @IsString()
    @Matches(/^\d{13}$/, { message: 'CNIC number must be exactly 13 digits' })
    cnicNumber: string;
}
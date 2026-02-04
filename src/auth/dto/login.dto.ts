import { IsString } from "class-validator";

export class loginDto{
    @IsString()
    phone:string;

    @IsString()
    password:string;
}
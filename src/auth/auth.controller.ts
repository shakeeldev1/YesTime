import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { loginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('signup')
    signup(@Body() dto:SignupDto) {
        return this.authService.signup(dto);
    }

    @Post('login')
    login(@Body() dto:loginDto){
        return this.authService.login(dto.phone,dto.password);
    }
}

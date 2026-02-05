import { Body, Controller, Post, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { loginDto } from './dto/login.dto';
import { refreshTokenDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

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

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    logout(@Request() req) {
        return this.authService.logout(req.user.userId);
    }

    @Post('refresh')
    refreshToken(@Body() dto: refreshTokenDto) {
        return this.authService.refreshToken(dto.refreshToken);
    }
}


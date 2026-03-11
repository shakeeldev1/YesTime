import { Body, Controller, Post, UseGuards, Request, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { loginDto } from './dto/login.dto';
import { refreshTokenDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('signup')
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'cnicFront', maxCount: 1 },
        { name: 'cnicBack', maxCount: 1 }
    ]))
    async signup(
        @Body() dto: SignupDto,
        @UploadedFiles() files: { cnicFront?: Express.Multer.File[], cnicBack?: Express.Multer.File[] }
    ) {
        return this.authService.signup(dto, files);
    }

    @Post('verify-otp')
    verifyOtp(@Body() dto: { email: string, otp: string }) {
        return this.authService.verifyOtp(dto.email, dto.otp);
    }

    @Post('resend-otp')
    resendOtp(@Body() dto: { email: string }) {
        return this.authService.resendOtp(dto.email);
    }

    @Post('login')
    login(@Body() dto:loginDto){
        return this.authService.login(dto.email, dto.password);
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    logout(@Request() req) {
        return this.authService.logout(req.user.userId);
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    changePassword(@Request() req, @Body() dto: { currentPassword: string; newPassword: string }) {
        return this.authService.changePassword(req.user.userId, dto.currentPassword, dto.newPassword);
    }

    @UseGuards(JwtAuthGuard)
    @Post('select-role')
    selectRole(@Request() req, @Body() dto: { 
        role: string; 
        shopName?: string; 
        shopLocation?: string; 
        shopType?: string; 
        shopDescription?: string;
    }) {
        return this.authService.selectRole(req.user.userId, dto);
    }

    @Post('refresh')
    refreshToken(@Body() dto: refreshTokenDto) {
        return this.authService.refreshToken(dto.refreshToken);
    }
}


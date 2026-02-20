import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { SignupDto } from './dto/signup.dto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class AuthService {
    constructor(
        private userService: UsersService, 
        private jwtService: JwtService,
        private cloudinaryService: CloudinaryService
    ) { }

    async signup(
        dto: SignupDto, 
        files?: { cnicFront?: Express.Multer.File[], cnicBack?: Express.Multer.File[] }
    ) {
        const exists = await this.userService.findByPhone(dto.phone);
        if (exists) throw new BadRequestException('User with this phone number already exists');
        
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const otp = await this.generateOtp();
        
        // Upload CNIC images to Cloudinary if provided
        let cnicFrontUrl: string | undefined;
        let cnicBackUrl: string | undefined;
        
        if (files?.cnicFront?.[0]) {
            const cnicFrontResult = await this.cloudinaryService.uploadImage(files.cnicFront[0], 'yes-time/cnic');
            cnicFrontUrl = cnicFrontResult.secure_url;
        }
        
        if (files?.cnicBack?.[0]) {
            const cnicBackResult = await this.cloudinaryService.uploadImage(files.cnicBack[0], 'yes-time/cnic');
            cnicBackUrl = cnicBackResult.secure_url;
        }
        
        const user = await this.userService.createUser({
            ...dto,
            password: hashedPassword,
            otp: otp,
            cnicFrontImage: cnicFrontUrl,
            cnicBackImage: cnicBackUrl
        });
        
        return { message: 'User registered successfully', userId: user._id, otp: otp };
    }

    async verifyOtp(phone: string, otp: string) {
        const user = await this.userService.findByPhone(phone);
        if (!user) throw new BadRequestException('User not found');
        if (user.otp !== otp) throw new BadRequestException('Invalid OTP');
        await user.updateOne({ isPhoneVerified: true, otp: null });
        const tokens = await this.signToken(user._id.toString());
        await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);
        
        // Return tokens along with user data
        return { 
            message: 'Phone number verified successfully', 
            ...tokens,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                isPhoneVerified: true
            }
        };
    }

    async login(phone: string, password: string) {
        const user = await this.userService.findByPhone(phone);
        if (!user) throw new BadRequestException('Invalid phone number or password');
        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) throw new BadRequestException('Invalid phone number or password');

        const tokens = await this.signToken(user._id.toString());
        await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);
        
        // Return tokens along with user data
        return {
            ...tokens,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                isPhoneVerified: user.isPhoneVerified
            }
        };
    }

    async logout(userId: string) {
        const user = await this.userService.findById(userId);
        if (!user) throw new BadRequestException('User not found');
        await user.updateOne({ refreshToken: null });
        return { message: 'Logged out successfully' };
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await this.userService.findByIdWithPassword(userId);
        if (!user) throw new BadRequestException('User not found');
        
        const passwordMatches = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatches) throw new BadRequestException('Current password is incorrect');
        
        if (currentPassword === newPassword) throw new BadRequestException('New password must be different from current password');
        if (newPassword.length < 6) throw new BadRequestException('New password must be at least 6 characters');
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.userService.updatePassword(userId, hashedPassword);
        
        return { message: 'Password changed successfully' };
    }

    async refreshToken(refreshToken: string) {
        let payload;
        try {
            payload = this.jwtService.verify(refreshToken, {
                secret: process.env.JWT_REFRESH_SECRET,
            });
        } catch (e) {
            throw new BadRequestException('Invalid refresh token');
        }

        const user = await this.userService.findById(payload.sub);
        if (!user || !user.refreshToken) throw new BadRequestException('Invalid refresh token');

        const tokenMatches = await bcrypt.compare(refreshToken, user.refreshToken);
        if (!tokenMatches) throw new BadRequestException('Invalid refresh token');

        const tokens = await this.signToken(user._id.toString());
        await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);
        return tokens;
    }

    async signToken(userId: string) {
        const payload = { sub: userId };
        const access_token = await this.jwtService.signAsync(payload, {
            secret: process.env.JWT_ACCESS_SECRET,
            expiresIn: '15m',
        });

        const refreshToken = await this.jwtService.signAsync(payload, {
            secret: process.env.JWT_REFRESH_SECRET,
            expiresIn: '7d',
        });

        return {
            access_token,
            refreshToken,
        };
    }

    private async saveRefreshToken(userId: string, refreshToken: string) {
        const hashedToken = await bcrypt.hash(refreshToken, 10);
        await this.userService.updateRefreshToken(userId, { refreshToken: hashedToken });
    }

    private async generateOtp() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
}

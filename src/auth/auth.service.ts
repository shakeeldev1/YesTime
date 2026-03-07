import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { SignupDto } from './dto/signup.dto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { MailerService } from 'src/mailer/mailer.service';
import { CashbackService } from 'src/cashback/cashback.service';

@Injectable()
export class AuthService {
    constructor(
        private userService: UsersService, 
        private jwtService: JwtService,
        private cloudinaryService: CloudinaryService,
        private mailerService: MailerService,
        private cashbackService: CashbackService,
    ) { }

    async signup(
        dto: SignupDto, 
        files?: { cnicFront?: Express.Multer.File[], cnicBack?: Express.Multer.File[] }
    ) {
        const [existingPhoneUser, existingEmailUser] = await Promise.all([
            this.userService.findByPhone(dto.phone),
            this.userService.findByEmail(dto.email),
        ]);

        if (existingPhoneUser) {
            throw new BadRequestException('User with this phone number already exists');
        }

        if (existingEmailUser) {
            throw new BadRequestException('User with this email already exists');
        }
        
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
        
        let user;
        try {
            user = await this.userService.createUser({
                ...dto,
                password: hashedPassword,
                otp: otp,
                cnicFrontImage: cnicFrontUrl,
                cnicBackImage: cnicBackUrl
            });
        } catch (error: any) {
            if (error?.code === 11000) {
                const duplicateField = Object.keys(error?.keyPattern || {})[0];
                if (duplicateField === 'email') {
                    throw new BadRequestException('User with this email already exists');
                }
                if (duplicateField === 'phone') {
                    throw new BadRequestException('User with this phone number already exists');
                }
                throw new BadRequestException('User already exists with provided details');
            }
            throw error;
        }
        
        // Send OTP via email
        try {
            await this.mailerService.sendOtpEmail(dto.email, otp, dto.name);
        } catch (error) {
            // If email fails, still return success but log the error
            console.error('Failed to send OTP email:', error.message);
        }
        
        return { message: 'User registered successfully. OTP sent to your email.', userId: user._id };
    }

    async verifyOtp(phone: string, otp: string) {
        const user = await this.userService.findByPhone(phone);
        if (!user) throw new BadRequestException('User not found');
        if (user.otp !== otp) throw new BadRequestException('Invalid OTP');
        await user.updateOne({ isPhoneVerified: true, otp: null });
        const tokens = await this.signToken(user._id.toString(), user.role || 'user');
        await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);
        
        // Return tokens along with user data
        return { 
            message: 'Email verified successfully', 
            ...tokens,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                isPhoneVerified: true,
                role: user.role || 'user',
                shopkeeperStatus: (user as any).shopkeeperStatus || 'none',
                registrationFeePaid: (user as any).registrationFeePaid || false
            }
        };
    }

    async resendOtp(email: string) {
        const user = await this.userService.findByEmail(email);
        if (!user) throw new BadRequestException('User not found');
        if (user.isPhoneVerified) throw new BadRequestException('Email already verified');
        
        const otp = await this.generateOtp();
        await user.updateOne({ otp });
        
        try {
            await this.mailerService.sendOtpEmail(email, otp, user.name);
        } catch (error) {
            console.error('Failed to resend OTP email:', error.message);
        }
        
        return { message: 'OTP resent to your email' };
    }

    async login(phone: string, password: string) {
        const user = await this.userService.findByPhone(phone);
        if (!user) throw new BadRequestException('Invalid phone number or password');
        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) throw new BadRequestException('Invalid phone number or password');

        const tokens = await this.signToken(user._id.toString(), user.role || 'user');
        await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);
        
        // Return tokens along with user data
        return {
            ...tokens,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                isPhoneVerified: user.isPhoneVerified,
                role: user.role || 'user',
                shopkeeperStatus: (user as any).shopkeeperStatus || 'none',
                registrationFeePaid: (user as any).registrationFeePaid || false
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

    async selectRole(userId: string, dto: {
        role: string;
        shopName?: string;
        shopLocation?: string;
        shopType?: string;
        shopDescription?: string;
    }) {
        const user = await this.userService.findById(userId);
        if (!user) throw new BadRequestException('User not found');
        
        if (dto.role === 'user') {
            await this.userService.updateRole(userId, 'user');
            const updatedUser = await this.userService.updateProfile(userId, { shopkeeperStatus: 'none' } as any);
            return {
                message: 'Welcome! You can now enter the system.',
                role: 'user',
                user: {
                    id: updatedUser?._id,
                    name: updatedUser?.name,
                    email: updatedUser?.email,
                    phone: updatedUser?.phone,
                    isPhoneVerified: updatedUser?.isPhoneVerified,
                    role: updatedUser?.role || 'user',
                    shopkeeperStatus: updatedUser?.shopkeeperStatus || 'none',
                }
            };
        } else if (dto.role === 'shopkeeper') {
            // Validate shopkeeper fields
            if (!dto.shopName || !dto.shopLocation || !dto.shopType) {
                throw new BadRequestException('Shop name, location and type are required for shopkeeper registration');
            }

            // Set role immediately to shopkeeper and keep status pending until admin approval.
            await this.userService.updateRole(userId, 'shopkeeper');

            const updatedUser = await this.userService.updateProfile(userId, {
                shopName: dto.shopName,
                shopLocation: dto.shopLocation,
                shopType: dto.shopType,
                shopDescription: dto.shopDescription,
                shopkeeperStatus: 'pending',
            } as any);

            // Create or refresh cashback shopkeeper request so admin can approve from pending list.
            const existingShop = await this.cashbackService.getMyShop(userId);
            if (!existingShop || existingShop.status === 'rejected') {
                await this.cashbackService.requestShopkeeper(userId, {
                    shopName: dto.shopName,
                    ownerName: user.name,
                    phone: user.phone,
                    address: dto.shopLocation,
                } as any);
            }

            // Notify admin via email
            const adminEmails = await this.userService.findAdminEmails();
            for (const adminEmail of adminEmails) {
                await this.mailerService.sendAdminNewShopkeeperRequest(adminEmail, dto.shopName, user.name);
            }

            return { 
                message: 'Shopkeeper application submitted. Admin will review your request.', 
                role: 'shopkeeper',
                shopkeeperStatus: 'pending',
                user: {
                    id: updatedUser?._id,
                    name: updatedUser?.name,
                    email: updatedUser?.email,
                    phone: updatedUser?.phone,
                    isPhoneVerified: updatedUser?.isPhoneVerified,
                    role: 'shopkeeper',
                    shopkeeperStatus: 'pending',
                }
            };
        } else {
            throw new BadRequestException('Invalid role. Must be "user" or "shopkeeper".');
        }
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

        const tokens = await this.signToken(user._id.toString(), user.role || 'user');
        await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);
        return tokens;
    }

    async signToken(userId: string, role: string = 'user') {
        const payload = { sub: userId, role };
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

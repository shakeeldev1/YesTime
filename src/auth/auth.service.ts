import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { SignupDto } from './dto/signup.dto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
    constructor(private userService: UsersService, private jwtService: JwtService) { }

    async signup(dto: SignupDto) {
        const exists = await this.userService.findByPhone(dto.phone);
        if (exists) throw new BadRequestException('User with this phone number already exists');
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = await this.userService.createUser({
            ...dto,
            password: hashedPassword
        })
        return this.signToken(user._id.toString());
    }

    async login(phone: string, password: string) {
        const user = await this.userService.findByPhone(phone);
        if (!user) throw new BadRequestException('Invalid phone number or password');
        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) throw new BadRequestException('Invalid phone number or password');

        const tokens = await this.signToken(user._id.toString());
        await this.saveRefreshToken(user._id.toString(), tokens.refreshToken);
        return tokens;
    }

    async logout(userId: string) {
        await this.userService.updateRefreshToken(userId, { refreshToken: null });
        return { message: 'Logged out successfully' };
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
}

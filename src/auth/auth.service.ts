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

    async login(phone:string,password:string){
        const user = await this.userService.findByPhone(phone);
        if(!user) throw new BadRequestException('Invalid phone number or password');
        const passwordMatches = await bcrypt.compare(password,user.password);
        if(!passwordMatches) throw new BadRequestException('Invalid phone number or password');
        return this.signToken(user._id.toString());
    }


    async signToken(userId: string) {
        const payload = { sub: userId };
        const token = await this.jwtService.signAsync(payload, {
            expiresIn: '7d',
        });
        return {
            access_token: token,
        };
    }
}

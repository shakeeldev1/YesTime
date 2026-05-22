import { Injectable } from "@nestjs/common";
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy){
    constructor(private readonly usersService: UsersService){
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: process.env.JWT_ACCESS_SECRET || 'your-secret-key-change-this',
        });
    }

    async validate(payload:any){
        const user = await this.usersService.findById(payload.sub);
        if (!user) {
            return null;
        }

        return {
            userId: user._id.toString(),
            role: user.role || payload.role || 'user',
            shopkeeperStatus: (user as any).shopkeeperStatus || 'none',
        };
    }
}
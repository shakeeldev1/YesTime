import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UsersService } from 'src/users/users.service';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
    constructor(private userService:UsersService){}

    @Get('me')
    getProfile(@Req() req){
        return this.userService.findById(req?.user?.userId);
    }
}

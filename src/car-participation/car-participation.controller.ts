import { Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CarParticipationService } from './car-participation.service';

@UseGuards(JwtAuthGuard)
@Controller('car-participation')
export class CarParticipationController {
    constructor(private readonly carParticipationService: CarParticipationService) { }

    @Post("join")
    join(@Request() req) {
        return this.carParticipationService.join(req.user.id);
    }

    @Get("my-participation")
    getMyParticipation(@Request() req) {
        return this.carParticipationService.getParticipation(req.user.id);
    }

    @Get("all-participations")
    getAllParticipations() {
        return this.carParticipationService.getAllParticipations();
    }
}

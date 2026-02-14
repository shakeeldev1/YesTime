import { Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CarParticipationService } from './car-participation.service';

@Controller('car-participation')
export class CarParticipationController {
    constructor(private readonly carParticipationService: CarParticipationService) { }

    @Post("join")
    @UseGuards(JwtAuthGuard)
    join(@Request() req) {
        return this.carParticipationService.join(req.user.userId);
    }

    @Get("my-participation")
    @UseGuards(JwtAuthGuard)
    getMyParticipation(@Request() req) {
        return this.carParticipationService.getParticipation(req.user.userId);
    }

    // Public endpoint - no auth needed
    @Get("all-participations")
    getAllParticipations() {
        return this.carParticipationService.getAllParticipations();
    }
}

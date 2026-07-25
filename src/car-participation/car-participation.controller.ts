import { Controller, Get, Post, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CarParticipationService } from './car-participation.service';

@Controller('car-participation')
export class CarParticipationController {
    constructor(private readonly carParticipationService: CarParticipationService) { }

    // Public endpoint - lets the join flow show full pricing info for every plan before choosing one.
    @Get("plans")
    getPlans() {
        return this.carParticipationService.getPlans();
    }

    @Post("join")
    @UseGuards(JwtAuthGuard)
    join(@Request() req, @Body() body?: { planId?: number | string; referralCode?: string; referredByUserId?: string; joinWithQurandazi?: boolean | string }) {
        // No global ValidationPipe in this app, so a JSON string like "2" would otherwise
        // fail isValidCarPlanId's strict typeof check even though it's a valid plan choice.
        const planId = body?.planId === undefined || body?.planId === null || body?.planId === ''
            ? undefined
            : Number(body.planId);
        const joinWithQurandazi = body?.joinWithQurandazi === undefined
            ? true
            : body.joinWithQurandazi === true || body.joinWithQurandazi === 'true';
        return this.carParticipationService.join(req.user.userId, planId, body?.referralCode, body?.referredByUserId, joinWithQurandazi);
    }

    @Get("my-participation")
    @UseGuards(JwtAuthGuard)
    getMyParticipation(@Request() req) {
        return this.carParticipationService.getParticipation(req.user.userId);
    }

    @Post('play-now')
    @UseGuards(JwtAuthGuard)
    playNow(@Request() req) {
        return this.carParticipationService.playNow(req.user.userId);
    }

    @Get('play-status')
    @UseGuards(JwtAuthGuard)
    getPlayStatus(@Request() req) {
        return this.carParticipationService.getMyPlayStatus(req.user.userId);
    }

    // Public endpoint - no auth needed
    @Get("all-participations")
    getAllParticipations() {
        return this.carParticipationService.getAllParticipations();
    }
}

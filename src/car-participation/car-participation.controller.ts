import { BadRequestException, Controller, Get, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
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

    @Post('switch-plan')
    @UseGuards(JwtAuthGuard)
    switchPlan(@Request() req, @Body() body?: { planId?: number | string }) {
        // Same string-vs-number coercion as join() - no global ValidationPipe in this app.
        if (body?.planId === undefined || body?.planId === null || body?.planId === '') {
            throw new BadRequestException('planId is required.');
        }
        const planId = Number(body.planId);
        return this.carParticipationService.switchPlan(req.user.userId, planId);
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

    // ========== CAR REQUEST (claim) WORKFLOW ==========

    @Post('request-car')
    @UseGuards(JwtAuthGuard)
    requestCar(@Request() req) {
        return this.carParticipationService.requestCar(req.user.userId);
    }

    @Get('my-car-request')
    @UseGuards(JwtAuthGuard)
    getMyCarRequest(@Request() req) {
        return this.carParticipationService.getMyCarRequest(req.user.userId);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get('requests/pending')
    getPendingCarRequests() {
        return this.carParticipationService.getPendingCarRequests();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get('requests/all')
    getAllCarRequests() {
        return this.carParticipationService.getAllCarRequests();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post('requests/:id/approve')
    approveCarRequest(@Request() req, @Param('id') id: string) {
        return this.carParticipationService.approveCarRequest(id, req.user.userId);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post('requests/:id/reject')
    rejectCarRequest(@Request() req, @Param('id') id: string, @Body('reason') reason?: string) {
        return this.carParticipationService.rejectCarRequest(id, req.user.userId, reason);
    }
}

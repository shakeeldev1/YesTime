import { BadRequestException, Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CarContributionsService } from './car-contributions.service';
import { CarContributionDto } from './dto/car-contribution.dto';

@UseGuards(JwtAuthGuard)
@Controller('car-contributions')
export class CarContributionsController {
    constructor(private readonly carContributionsService: CarContributionsService){}

    @Post()
    async create(@Request() req,@Body() dto: CarContributionDto) {
        const amount = Number(dto.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new BadRequestException('Amount must be a valid positive number');
        }
        return this.carContributionsService.create(req.user.userId, dto.participationId, amount);
    }

    @Get("my")
    async getMyContributions(@Request() req) {
        return this.carContributionsService.getMyContributions(req.user.userId);
    }

    @Get("stats")
    async getMyStats(@Request() req) {
        return this.carContributionsService.getContributionStats(req.user.userId);
    }
}

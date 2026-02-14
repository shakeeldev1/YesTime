import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CarWinnerService } from './car-winner.service';

@Controller('car-winner')
export class CarWinnerController {
    constructor(private readonly carWinnerService: CarWinnerService) { }

    // Admin only - can be protected separately if needed
    @Post('spin')
    async spinWinner() {
        return this.carWinnerService.spinAndSelectWinner();
    }

    // Public endpoint - no auth needed
    @Get('next-draw')
    async getNextDraw() {
        return this.carWinnerService.getNextDrawInfo();
    }

    // Public endpoint - no auth needed
    @Get('all')
    async getAllCarWinners() {
        return this.carWinnerService.getAllCarWinners();
    }

    // Public endpoint - no auth needed
    @Get('draw-history')
    async getDrawHistory(@Query('limit') limit?: number) {
        return this.carWinnerService.getDrawHistory(limit ? +limit : 10);
    }

    // Public endpoint - no auth needed
    @Get('stats')
    async getStats() {
        return this.carWinnerService.getWinnerStats();
    }
}

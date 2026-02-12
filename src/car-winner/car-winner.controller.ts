import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CarWinnerService } from './car-winner.service';

@UseGuards(JwtAuthGuard)
@Controller('car-winner')
export class CarWinnerController {
    constructor(private readonly carWinnerService: CarWinnerService){}

    @Post('add')
    async addCarWinner(@Body() winningCoupen:string){
        return this.carWinnerService.addCarWinner(winningCoupen);
    }

    @Get('all')
    async getAllCarWinners(){
        return this.carWinnerService.getAllCarWinners();
    }
}
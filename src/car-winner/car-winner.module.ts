import { Module } from '@nestjs/common';
import { CarWinnerController } from './car-winner.controller';
import { CarWinnerService } from './car-winner.service';

@Module({
  controllers: [CarWinnerController],
  providers: [CarWinnerService]
})
export class CarWinnerModule {}

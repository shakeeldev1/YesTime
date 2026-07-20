import { Module } from '@nestjs/common';
import { DrawSchedulerService } from './draw-scheduler.service';
import { DrawSchedulerController } from './draw-scheduler.controller';
import { RegistrationLotteryModule } from '../registration-lottery/registration-lottery.module';
import { CarWinnerModule } from '../car-winner/car-winner.module';
import { GameModule } from '../game/game.module';
import { CashbackModule } from '../cashback/cashback.module';

@Module({
  imports: [RegistrationLotteryModule, CarWinnerModule, GameModule, CashbackModule],
  controllers: [DrawSchedulerController],
  providers: [DrawSchedulerService],
})
export class DrawSchedulerModule {}

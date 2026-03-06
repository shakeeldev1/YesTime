import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RegistrationLotteryService } from './registration-lottery.service';

@Injectable()
export class RegistrationDrawScheduler {
  private readonly logger = new Logger(RegistrationDrawScheduler.name);

  constructor(private readonly service: RegistrationLotteryService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDraw() {
    this.logger.log('🎫 Executing registration lottery draw...');
    try {
      const result = await this.service.executeLuckyDraw();
      if (result.draw) {
        this.logger.log(
          `Registration Draw #${result.draw.drawNumber} complete. Winner: ${result.draw.hasWinner ? result.draw.winnerCoupon : 'None'}`,
        );
      } else {
        this.logger.log('No participants for registration draw');
      }
    } catch (error) {
      this.logger.error('Registration lottery draw failed:', error);
    }
  }
}

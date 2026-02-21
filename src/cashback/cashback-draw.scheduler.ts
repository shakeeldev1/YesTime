import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CashbackService } from './cashback.service';

@Injectable()
export class CashbackDrawScheduler {
  private readonly logger = new Logger(CashbackDrawScheduler.name);

  constructor(private readonly cashbackService: CashbackService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDraw() {
    this.logger.log('🛒 Executing cashback lucky draw...');
    try {
      const result = await this.cashbackService.executeLuckyDraw();
      if (result.draw) {
        this.logger.log(
          `Cashback Draw #${result.draw.drawNumber} complete. Winner: ${result.draw.hasWinner ? result.draw.winnerCoupon : 'None'}. Prize: PKR ${result.draw.prizeAmount}`,
        );
      } else {
        this.logger.log('No participants for cashback draw');
      }
    } catch (error) {
      this.logger.error('Cashback lucky draw failed:', error);
    }
  }
}

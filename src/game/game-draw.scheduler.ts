import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GameService } from './game.service';

@Injectable()
export class GameDrawScheduler {
  private readonly logger = new Logger(GameDrawScheduler.name);

  constructor(private readonly gameService: GameService) {}

  // Run lucky draw every day at 10:00 PM
  @Cron('0 22 * * *')
  async handleDailyDraw() {
    this.logger.log('🎰 Executing daily lucky draw...');
    try {
      const result = await this.gameService.executeLuckyDraw();
      if (result.draw) {
        this.logger.log(
          `Draw #${result.draw.drawNumber} complete. Winner: ${result.draw.hasWinner ? result.draw.winnerCoupon : 'None'}. Prize: ₹${result.draw.prizeAmount}`,
        );
      } else {
        this.logger.log('No participants for the draw');
      }
    } catch (error) {
      this.logger.error('Lucky draw failed:', error);
    }
  }
}

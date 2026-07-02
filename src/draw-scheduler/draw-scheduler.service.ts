import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RegistrationLotteryService } from '../registration-lottery/registration-lottery.service';
import { CarWinnerService } from '../car-winner/car-winner.service';
import { GameService } from '../game/game.service';
import { CashbackService } from '../cashback/cashback.service';

/**
 * Every minute, exactly one of the 4 lottery modules runs its draw, cycling in a
 * fixed round-robin: registration -> car -> game -> cashback -> registration -> ...
 * So each module draws once every 4 minutes, staggered 1 minute apart from the others.
 * The rotation slot is derived from the absolute wall-clock minute (not an in-memory
 * counter) so the sequence survives server restarts without getting out of sync.
 */
@Injectable()
export class DrawSchedulerService {
  private readonly logger = new Logger(DrawSchedulerService.name);

  private readonly rotation: Array<{ name: string; run: () => Promise<any> }> = [
    { name: 'Registration Lottery', run: () => this.registrationLotteryService.executeLuckyDraw() },
    { name: 'Car Contribution', run: () => this.carWinnerService.spinAndSelectWinner() },
    { name: 'Game', run: () => this.gameService.executeLuckyDraw() },
    { name: 'Cashback', run: () => this.cashbackService.executeLuckyDraw() },
  ];

  constructor(
    private readonly registrationLotteryService: RegistrationLotteryService,
    private readonly carWinnerService: CarWinnerService,
    private readonly gameService: GameService,
    private readonly cashbackService: CashbackService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleTick() {
    const minuteIndex = Math.floor(Date.now() / 60000);
    const slot = minuteIndex % this.rotation.length;
    const { name, run } = this.rotation[slot];

    this.logger.log(`Running draw for module: ${name}`);
    try {
      const result = await run();
      this.logger.log(`${name} draw finished: ${JSON.stringify(result?.draw ?? result)}`);
    } catch (error) {
      this.logger.error(`${name} draw failed:`, error);
    }
  }
}

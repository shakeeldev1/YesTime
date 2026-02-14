import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CarWinnerService } from '../car-winner/car-winner.service';

@Injectable()
export class CarDrawScheduler {
    private readonly logger = new Logger(CarDrawScheduler.name);
    private isRunning = false;

    constructor(private readonly carWinnerService: CarWinnerService) {}

    // Run every 60 seconds
    @Cron('0 * * * * *') // Every minute at 0 seconds
    async handleAutomaticDraw() {
        if (this.isRunning) {
            this.logger.warn('Previous draw still running, skipping...');
            return;
        }

        try {
            this.isRunning = true;
            this.logger.log('Starting automatic car lottery draw...');

            const result = await this.carWinnerService.spinAndSelectWinner();

            if (result.winner) {
                this.logger.log(`Winner selected: Coupon ${result.winner.coupenNumber}`);
            } else {
                this.logger.log('No eligible participants for this draw');
            }
        } catch (error) {
            this.logger.error(`Error during automatic draw: ${error.message}`);
        } finally {
            this.isRunning = false;
        }
    }
}

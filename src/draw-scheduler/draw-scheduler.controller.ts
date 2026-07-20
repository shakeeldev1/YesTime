import { Controller, Get } from '@nestjs/common';
import { DrawSchedulerService } from './draw-scheduler.service';

@Controller('draw-scheduler')
export class DrawSchedulerController {
  constructor(private readonly drawSchedulerService: DrawSchedulerService) {}

  /** PUBLIC: Which module is drawing right now, its countdown, and the latest result for all 4 modules. */
  @Get('live')
  async getLiveDrawStatus() {
    return this.drawSchedulerService.getLiveDrawStatus();
  }
}

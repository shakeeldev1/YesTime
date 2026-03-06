import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RegistrationLotteryService } from './registration-lottery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('registration-lottery')
export class RegistrationLotteryController {
  constructor(private readonly service: RegistrationLotteryService) {}

  @UseGuards(JwtAuthGuard)
  @Post('pay')
  async payRegistrationFee(@Request() req) {
    return this.service.payRegistrationFee(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-info')
  async getMyLotteryInfo(@Request() req) {
    return this.service.getMyLotteryInfo(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('dashboard-stats')
  async getDashboardStats(@Request() req) {
    return this.service.getDashboardStats(req.user.userId);
  }

  @Get('draw-history')
  async getDrawHistory(@Query('limit') limit?: number) {
    return this.service.getDrawHistory(limit || 20);
  }

  @Get('next-draw')
  async getNextDrawInfo() {
    return this.service.getNextDrawInfo();
  }

  @UseGuards(JwtAuthGuard)
  @Get('winning-history')
  async getWinningHistory(@Request() req) {
    return this.service.getWinningHistory(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('trigger-draw')
  async triggerDraw() {
    return this.service.executeLuckyDraw();
  }

  // Notifications
  @UseGuards(JwtAuthGuard)
  @Get('notifications')
  async getNotifications(@Request() req, @Query('limit') limit?: number) {
    return this.service.getNotifications(req.user.userId, limit || 50);
  }

  @UseGuards(JwtAuthGuard)
  @Get('notifications/unread-count')
  async getUnreadCount(@Request() req) {
    return this.service.getUnreadCount(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('notifications/:id/read')
  async markNotificationRead(@Request() req, @Param('id') id: string) {
    return this.service.markNotificationRead(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('notifications/mark-all-read')
  async markAllRead(@Request() req) {
    return this.service.markAllNotificationsRead(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('notifications/:id')
  async deleteNotification(@Request() req, @Param('id') id: string) {
    return this.service.deleteNotification(req.user.userId, id);
  }
}

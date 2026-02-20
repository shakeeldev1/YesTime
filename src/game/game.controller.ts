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
import { GameService } from './game.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  // ============================
  // GAME CYCLE ENDPOINTS
  // ============================

  @UseGuards(JwtAuthGuard)
  @Post('join')
  async joinGame(@Request() req) {
    return this.gameService.joinGame(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('daily-payment')
  async makeDailyPayment(@Request() req) {
    return this.gameService.makeDailyPayment(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('active-cycle')
  async getActiveCycle(@Request() req) {
    return this.gameService.getActiveCycle(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('savings')
  async getSavings(@Request() req) {
    return this.gameService.getSavings(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('coupons')
  async getUserCoupons(@Request() req) {
    return this.gameService.getUserCoupons(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('payment-history')
  async getPaymentHistory(
    @Request() req,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
  ) {
    return this.gameService.getPaymentHistory(req.user.userId, limit || 50, page || 1);
  }

  @UseGuards(JwtAuthGuard)
  @Get('dashboard-stats')
  async getDashboardStats(@Request() req) {
    return this.gameService.getDashboardStats(req.user.userId);
  }

  // ============================
  // DRAW ENDPOINTS
  // ============================

  @Get('draw-history')
  async getDrawHistory(@Query('limit') limit?: number) {
    return this.gameService.getDrawHistory(limit || 20);
  }

  @Get('next-draw')
  async getNextDrawInfo() {
    return this.gameService.getNextDrawInfo();
  }

  @UseGuards(JwtAuthGuard)
  @Get('winning-history')
  async getWinningHistory(@Request() req) {
    return this.gameService.getWinningHistory(req.user.userId);
  }

  // Manual draw trigger (for testing)
  @UseGuards(JwtAuthGuard)
  @Post('trigger-draw')
  async triggerDraw() {
    return this.gameService.triggerManualDraw();
  }

  // ============================
  // NOTIFICATION ENDPOINTS
  // ============================

  @UseGuards(JwtAuthGuard)
  @Get('notifications')
  async getNotifications(@Request() req, @Query('limit') limit?: number) {
    return this.gameService.getNotifications(req.user.userId, limit || 50);
  }

  @UseGuards(JwtAuthGuard)
  @Get('notifications/unread-count')
  async getUnreadCount(@Request() req) {
    return this.gameService.getUnreadCount(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('notifications/:id/read')
  async markNotificationRead(@Request() req, @Param('id') id: string) {
    return this.gameService.markNotificationRead(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('notifications/mark-all-read')
  async markAllRead(@Request() req) {
    return this.gameService.markAllNotificationsRead(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('notifications/:id')
  async deleteNotification(@Request() req, @Param('id') id: string) {
    return this.gameService.deleteNotification(req.user.userId, id);
  }
}

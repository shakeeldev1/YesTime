import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CashbackService } from './cashback.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RegisterShopkeeperDto, RecordPurchaseDto } from './dto/cashback.dto';

@Controller('cashback')
export class CashbackController {
  constructor(private readonly cashbackService: CashbackService) {}

  // ========== SHOPKEEPER ENDPOINTS ==========

  /** User requests to become a shopkeeper (pending admin approval) */
  @UseGuards(JwtAuthGuard)
  @Post('shopkeeper/request')
  async requestShopkeeper(@Request() req, @Body() dto: RegisterShopkeeperDto) {
    return this.cashbackService.requestShopkeeper(req.user.userId, dto);
  }

  /** Legacy: Direct register (pays fee immediately) */
  @UseGuards(JwtAuthGuard)
  @Post('shopkeeper/register')
  async registerShopkeeper(@Request() req, @Body() dto: RegisterShopkeeperDto) {
    return this.cashbackService.registerShopkeeper(req.user.userId, dto);
  }

  /** Admin: Approve pending shopkeeper */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('shopkeeper/:id/approve')
  async approveShopkeeper(@Param('id') id: string) {
    return this.cashbackService.approveShopkeeper(id);
  }

  /** Admin: Reject pending shopkeeper */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('shopkeeper/:id/reject')
  async rejectShopkeeper(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.cashbackService.rejectShopkeeper(id, reason);
  }

  /** Get pending shopkeeper requests (admin) */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('shopkeeper/pending')
  async getPendingShopkeepers() {
    return this.cashbackService.getPendingShopkeepers();
  }

  @UseGuards(JwtAuthGuard)
  @Get('shopkeeper/my-shop')
  async getMyShop(@Request() req) {
    return this.cashbackService.getMyShop(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('shopkeeper/sales-overview')
  async getShopkeeperSalesOverview(
    @Request() req,
    @Query('range') range?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.cashbackService.getShopkeeperSalesOverview(req.user.userId, range || 'daily', start, end);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('shopkeeper/all')
  async getAllShopkeepers() {
    return this.cashbackService.getAllShopkeepers();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('shopkeeper/stats')
  async getShopkeeperStats() {
    return this.cashbackService.getShopkeeperStats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('shopkeeper/:id')
  async deleteShopkeeper(@Param('id') id: string) {
    return this.cashbackService.deleteShopkeeper(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('shopkeeper/:id')
  async getShopkeeperById(@Param('id') id: string) {
    return this.cashbackService.getShopkeeperById(id);
  }

  // ========== PURCHASE ENDPOINTS ==========

  @UseGuards(JwtAuthGuard)
  @Post('purchase')
  async recordPurchase(@Request() req, @Body() dto: RecordPurchaseDto) {
    return this.cashbackService.recordPurchase(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('purchases/my')
  async getMyPurchases(@Request() req, @Query('limit') limit?: number) {
    return this.cashbackService.getMyPurchases(req.user.userId, limit || 50);
  }

  @UseGuards(JwtAuthGuard)
  @Get('purchases/shop/:shopkeeperId')
  async getShopPurchases(@Param('shopkeeperId') shopkeeperId: string, @Query('limit') limit?: number) {
    return this.cashbackService.getShopPurchases(shopkeeperId, limit || 50);
  }

  /** Shopkeeper's own recorded purchases */
  @UseGuards(JwtAuthGuard)
  @Get('purchases/shopkeeper/:shopkeeperId')
  async getShopkeeperPurchases(@Param('shopkeeperId') shopkeeperId: string, @Query('limit') limit?: number) {
    return this.cashbackService.getShopkeeperPurchases(shopkeeperId, limit || 50);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('purchases/all')
  async getAllPurchases(@Query('limit') limit?: number) {
    return this.cashbackService.getAllPurchases(limit || 100);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('cycles/all')
  async getAllCustomerCycles(@Query('limit') limit?: number) {
    return this.cashbackService.getAllCustomerCycles(limit || 200);
  }

  // ========== CUSTOMER CYCLE ENDPOINTS ==========

  @UseGuards(JwtAuthGuard)
  @Post('join')
  async joinCashback(@Request() req) {
    return this.cashbackService.joinCashback(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('active-cycle')
  async getActiveCycle(@Request() req) {
    return this.cashbackService.getMyActiveCycle(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-cycles')
  async getMyCycles(@Request() req) {
    return this.cashbackService.getAllMyCycles(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('commitment-table')
  async getCommitmentTable(@Request() req) {
    return this.cashbackService.getCommitmentTable(req.user.userId);
  }

  // ========== DRAW ENDPOINTS ==========

  @Get('draw/history')
  async getDrawHistory(@Query('limit') limit?: number) {
    return this.cashbackService.getDrawHistory(limit || 20);
  }

  @Get('draw/next')
  async getNextDrawInfo() {
    return this.cashbackService.getNextDrawInfo();
  }

  @UseGuards(JwtAuthGuard)
  @Get('draw/winning-history')
  async getWinningHistory(@Request() req) {
    return this.cashbackService.getWinningHistory(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('draw/trigger')
  async triggerDraw() {
    return this.cashbackService.executeLuckyDraw();
  }

  // ========== DASHBOARD ==========

  @UseGuards(JwtAuthGuard)
  @Get('dashboard-stats')
  async getDashboardStats(@Request() req) {
    return this.cashbackService.getDashboardStats(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin-stats')
  async getAdminStats() {
    return this.cashbackService.getAdminStats();
  }

  // ========== NOTIFICATIONS ==========

  @UseGuards(JwtAuthGuard)
  @Get('notifications')
  async getNotifications(@Request() req, @Query('limit') limit?: number) {
    return this.cashbackService.getNotifications(req.user.userId, limit || 50);
  }

  @UseGuards(JwtAuthGuard)
  @Get('notifications/unread-count')
  async getUnreadCount(@Request() req) {
    return this.cashbackService.getUnreadCount(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('notifications/:id/read')
  async markNotificationRead(@Request() req, @Param('id') id: string) {
    return this.cashbackService.markNotificationRead(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('notifications/mark-all-read')
  async markAllRead(@Request() req) {
    return this.cashbackService.markAllNotificationsRead(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('notifications/:id')
  async deleteNotification(@Request() req, @Param('id') id: string) {
    return this.cashbackService.deleteNotification(req.user.userId, id);
  }
}

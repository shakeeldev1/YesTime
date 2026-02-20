import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GameCycle } from './schemas/game-cycle.schema';
import { GameDraw } from './schemas/game-draw.schema';
import { GamePayment } from './schemas/game-payment.schema';
import { GameNotification } from './schemas/game-notification.schema';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class GameService {
  private readonly DAILY_AMOUNT = 25;
  private readonly CYCLE_DAYS = 30;
  private readonly BASE_PRIZE = 1000; // Day 1 prize; increases by 1000 each day

  constructor(
    @InjectModel(GameCycle.name) private readonly cycleModel: Model<GameCycle>,
    @InjectModel(GameDraw.name) private readonly drawModel: Model<GameDraw>,
    @InjectModel(GamePayment.name) private readonly paymentModel: Model<GamePayment>,
    @InjectModel(GameNotification.name) private readonly notificationModel: Model<GameNotification>,
    private readonly walletService: WalletService,
  ) {}

  // Generate a unique 6-digit coupon number
  private generateCoupon(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // Generate random 6-digit winning number for draw
  private generateWinningNumber(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // Get prize amount based on day number: day 1 = 1000, day 2 = 2000, ..., day 30 = 30000
  private getPrizeForDay(day: number): number {
    return day * this.BASE_PRIZE;
  }

  // ============================
  // JOIN GAME / START FIRST CYCLE
  // ============================
  async joinGame(userId: string) {
    // Check if user already has an active cycle
    const existingCycle = await this.cycleModel.findOne({ userId, status: 'active' });
    if (existingCycle) {
      throw new BadRequestException('You already have an active game cycle');
    }

    // Check wallet balance
    const balance = await this.walletService.getBalance(userId);
    if (balance < this.DAILY_AMOUNT) {
      throw new BadRequestException('Insufficient wallet balance. You need at least ₹25');
    }

    // Debit wallet
    await this.walletService.debit(userId, this.DAILY_AMOUNT);

    // Create new cycle
    const coupon = this.generateCoupon();
    const now = new Date();
    const cycle = new this.cycleModel({
      userId,
      couponNumber: coupon,
      currentDay: 1,
      totalSavings: this.DAILY_AMOUNT,
      dailyAmount: this.DAILY_AMOUNT,
      cycleDays: this.CYCLE_DAYS,
      status: 'active',
      cycleStartDate: now,
      cycleEndDate: new Date(now.getTime() + this.CYCLE_DAYS * 24 * 60 * 60 * 1000),
      isPermanent: false,
      permanentPrizeAmount: 0,
      lastPaymentDate: now,
      paymentDates: [now],
    });
    await cycle.save();

    // Record payment
    const payment = new this.paymentModel({
      userId,
      cycleId: cycle._id.toString(),
      couponNumber: coupon,
      amount: this.DAILY_AMOUNT,
      dayNumber: 1,
      paymentDate: now,
      status: 'completed',
    });
    await payment.save();

    // Create notification
    await this.createNotification(userId, 'Game Joined!', `You joined the Risk-Free Game! Coupon: ${coupon}. ₹${this.DAILY_AMOUNT} deducted from wallet.`, 'GAME');

    return {
      message: 'Successfully joined the game!',
      cycle: {
        id: cycle._id,
        couponNumber: coupon,
        currentDay: 1,
        totalSavings: this.DAILY_AMOUNT,
        status: 'active',
        cycleStartDate: now,
        prizeIfWinToday: this.getPrizeForDay(1),
      },
    };
  }

  // ============================
  // DAILY PAYMENT (add 25 more)
  // ============================
  async makeDailyPayment(userId: string) {
    const cycle = await this.cycleModel.findOne({ userId, status: 'active' });
    if (!cycle) {
      throw new NotFoundException('No active game cycle found. Please join the game first.');
    }

    // Check if already paid today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastPayment = cycle.lastPaymentDate ? new Date(cycle.lastPaymentDate) : null;
    if (lastPayment) {
      const lastPayDay = new Date(lastPayment);
      lastPayDay.setHours(0, 0, 0, 0);
      if (lastPayDay.getTime() === today.getTime()) {
        throw new BadRequestException('You have already made today\'s payment');
      }
    }

    if (cycle.currentDay >= this.CYCLE_DAYS) {
      throw new BadRequestException('This cycle is already complete (30 days done)');
    }

    // Check wallet balance
    const balance = await this.walletService.getBalance(userId);
    if (balance < this.DAILY_AMOUNT) {
      throw new BadRequestException('Insufficient wallet balance. You need at least ₹25');
    }

    // Debit wallet
    await this.walletService.debit(userId, this.DAILY_AMOUNT);

    // Update cycle
    cycle.currentDay += 1;
    cycle.totalSavings += this.DAILY_AMOUNT;
    cycle.lastPaymentDate = new Date();
    cycle.paymentDates.push(new Date());
    await cycle.save();

    // Record payment
    const payment = new this.paymentModel({
      userId,
      cycleId: cycle._id.toString(),
      couponNumber: cycle.couponNumber,
      amount: this.DAILY_AMOUNT,
      dayNumber: cycle.currentDay,
      paymentDate: new Date(),
      status: 'completed',
    });
    await payment.save();

    // Notification
    await this.createNotification(
      userId,
      `Day ${cycle.currentDay} Payment`,
      `₹${this.DAILY_AMOUNT} added. Total savings: ₹${cycle.totalSavings}. Prize today: ₹${this.getPrizeForDay(cycle.currentDay)}`,
      'SAVINGS',
    );

    return {
      message: `Day ${cycle.currentDay} payment successful!`,
      cycle: {
        id: cycle._id,
        couponNumber: cycle.couponNumber,
        currentDay: cycle.currentDay,
        totalSavings: cycle.totalSavings,
        daysLeft: this.CYCLE_DAYS - cycle.currentDay,
        prizeIfWinToday: this.getPrizeForDay(cycle.currentDay),
      },
    };
  }

  // ============================
  // GET ACTIVE CYCLE (dashboard overview)
  // ============================
  async getActiveCycle(userId: string) {
    const cycle = await this.cycleModel.findOne({ userId, status: 'active' });
    if (!cycle) {
      return { hasCycle: false, cycle: null };
    }

    const nextDraw = await this.getNextDrawInfo();

    return {
      hasCycle: true,
      cycle: {
        id: cycle._id,
        couponNumber: cycle.couponNumber,
        currentDay: cycle.currentDay,
        totalSavings: cycle.totalSavings,
        daysLeft: this.CYCLE_DAYS - cycle.currentDay,
        status: cycle.status,
        cycleStartDate: cycle.cycleStartDate,
        cycleEndDate: cycle.cycleEndDate,
        isPermanent: cycle.isPermanent,
        permanentPrizeAmount: cycle.permanentPrizeAmount,
        prizeIfWinToday: this.getPrizeForDay(cycle.currentDay),
        lastPaymentDate: cycle.lastPaymentDate,
        canPayToday: this.canPayToday(cycle),
      },
      nextDraw,
    };
  }

  private canPayToday(cycle: GameCycle): boolean {
    if (cycle.currentDay >= this.CYCLE_DAYS) return false;
    if (!cycle.lastPaymentDate) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastPayDay = new Date(cycle.lastPaymentDate);
    lastPayDay.setHours(0, 0, 0, 0);
    return lastPayDay.getTime() < today.getTime();
  }

  // ============================
  // GET SAVINGS
  // ============================
  async getSavings(userId: string) {
    const activeCycle = await this.cycleModel.findOne({ userId, status: 'active' });
    const completedCycles = await this.cycleModel.find({ userId, status: 'completed' });
    const wonCycles = await this.cycleModel.find({ userId, status: 'won' });

    const activeSavings = activeCycle ? activeCycle.totalSavings : 0;
    const completedSavings = completedCycles.reduce((sum, c) => sum + c.totalSavings, 0);
    const totalWinnings = wonCycles.reduce((sum, c) => sum + (c.permanentPrizeAmount || 0), 0);

    return {
      activeSavings,
      completedSavings,
      totalWinnings,
      totalSavings: activeSavings + completedSavings,
      activeCycle: activeCycle ? {
        couponNumber: activeCycle.couponNumber,
        currentDay: activeCycle.currentDay,
        totalSavings: activeCycle.totalSavings,
      } : null,
      completedCyclesCount: completedCycles.length,
      wonCyclesCount: wonCycles.length,
    };
  }

  // ============================
  // GET PAYMENT HISTORY
  // ============================
  async getPaymentHistory(userId: string, limit = 50, page = 1) {
    const skip = (page - 1) * limit;
    const payments = await this.paymentModel
      .find({ userId })
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await this.paymentModel.countDocuments({ userId });

    return { payments, total, page, limit };
  }

  // ============================
  // GET ALL USER COUPONS (active + permanent + completed)
  // ============================
  async getUserCoupons(userId: string) {
    const cycles = await this.cycleModel.find({ userId }).sort({ createdAt: -1 });
    return cycles.map((c) => ({
      id: c._id,
      couponNumber: c.couponNumber,
      currentDay: c.currentDay,
      totalSavings: c.totalSavings,
      status: c.status,
      isPermanent: c.isPermanent,
      permanentPrizeAmount: c.permanentPrizeAmount,
      cycleStartDate: c.cycleStartDate,
      cycleEndDate: c.cycleEndDate,
      prizeIfWinToday: c.status === 'active' ? this.getPrizeForDay(c.currentDay) : 0,
    }));
  }

  // ============================
  // LUCKY DRAW EXECUTION (called by scheduler)
  // ============================
  async executeLuckyDraw() {
    // Get all active + permanent coupons
    const activeCycles = await this.cycleModel.find({
      $or: [{ status: 'active' }, { isPermanent: true, status: 'completed' }],
    });

    if (activeCycles.length === 0) {
      return { message: 'No participants for the draw', draw: null };
    }

    // Generate winning number
    const winningNumber = this.generateWinningNumber();

    // Check if any coupon matches
    const winner = activeCycles.find((c) => c.couponNumber === winningNumber);

    // Get next draw number
    const lastDraw = await this.drawModel.findOne().sort({ drawNumber: -1 });
    const drawNumber = lastDraw ? lastDraw.drawNumber + 1 : 1;

    let prizeAmount = 0;
    let winnerUserId: string | undefined = undefined;
    let winnerCoupon: string | undefined = undefined;

    if (winner) {
      // Determine prize
      if (winner.isPermanent) {
        prizeAmount = winner.permanentPrizeAmount || 30000;
      } else {
        prizeAmount = this.getPrizeForDay(winner.currentDay);
      }

      winnerUserId = winner.userId;
      winnerCoupon = winner.couponNumber;

      // Credit winner's wallet
      await this.walletService.credit(winner.userId, prizeAmount);

      // Update cycle status
      winner.status = 'won';
      await winner.save();

      // Notify winner
      await this.createNotification(
        winner.userId,
        '🎉 YOU WON!',
        `Congratulations! Your coupon ${winner.couponNumber} won ₹${prizeAmount} in Lucky Draw #${drawNumber}!`,
        'WIN',
      );
    }

    // For non-winners with active cycles: savings are already tracked in totalSavings
    // Check cycles that completed 30 days and convert them to permanent
    await this.checkAndConvertCompletedCycles();

    // Record draw
    const draw = new this.drawModel({
      drawNumber,
      winningNumber,
      winnerUserId,
      winnerCoupon,
      prizeAmount,
      totalParticipants: activeCycles.length,
      drawDate: new Date(),
      status: 'completed',
    });
    await draw.save();

    // Notify all participants about draw result
    for (const cycle of activeCycles) {
      if (cycle.userId !== winnerUserId) {
        await this.createNotification(
          cycle.userId,
          `Draw #${drawNumber} Result`,
          winner
            ? `Winning number: ${winningNumber}. Winner: ${winnerCoupon}. Your savings are safe!`
            : `Winning number: ${winningNumber}. No winner this round. Your savings are safe!`,
          'GAME',
        );
      }
    }

    return {
      draw: {
        drawNumber,
        winningNumber,
        hasWinner: !!winner,
        winnerCoupon,
        prizeAmount,
        totalParticipants: activeCycles.length,
        drawDate: draw.drawDate,
      },
    };
  }

  // ============================
  // CHECK & CONVERT 30-DAY COMPLETED CYCLES
  // ============================
  private async checkAndConvertCompletedCycles() {
    const completedCycles = await this.cycleModel.find({
      status: 'active',
      currentDay: { $gte: this.CYCLE_DAYS },
    });

    for (const cycle of completedCycles) {
      // Mark as completed permanently in the draw
      cycle.status = 'completed';
      cycle.isPermanent = true;
      cycle.permanentPrizeAmount = 30000; // After 30 days, eligible for 30000
      await cycle.save();

      // Credit savings back to user
      await this.walletService.credit(cycle.userId, cycle.totalSavings);

      // Notify user
      await this.createNotification(
        cycle.userId,
        '🎊 30-Day Cycle Complete!',
        `Your savings of ₹${cycle.totalSavings} have been credited to your wallet. Your coupon ${cycle.couponNumber} is now permanently in the draw for ₹30,000!`,
        'SAVINGS',
      );
    }
  }

  // ============================
  // MANUAL DRAW (for testing / admin)
  // ============================
  async triggerManualDraw() {
    return this.executeLuckyDraw();
  }

  // ============================
  // GET DRAW HISTORY
  // ============================
  async getDrawHistory(limit = 20) {
    return this.drawModel.find().sort({ drawDate: -1 }).limit(limit);
  }

  // ============================
  // GET WINNING HISTORY FOR USER
  // ============================
  async getWinningHistory(userId: string) {
    const draws = await this.drawModel.find({ winnerUserId: userId }).sort({ drawDate: -1 });
    const totalWon = draws.reduce((sum, d) => sum + d.prizeAmount, 0);
    return { wins: draws, totalWon, totalWins: draws.length };
  }

  // ============================
  // GET NEXT DRAW INFO
  // ============================
  async getNextDrawInfo() {
    const lastDraw = await this.drawModel.findOne().sort({ drawDate: -1 });
    const totalParticipants = await this.cycleModel.countDocuments({
      $or: [{ status: 'active' }, { isPermanent: true, status: 'completed' }],
    });

    // Next draw is at 10:00 PM today or tomorrow
    const now = new Date();
    const nextDraw = new Date(now);
    nextDraw.setHours(22, 0, 0, 0);
    if (now >= nextDraw) {
      nextDraw.setDate(nextDraw.getDate() + 1);
    }

    return {
      nextDrawTime: nextDraw,
      totalParticipants,
      lastDraw: lastDraw
        ? {
            drawNumber: lastDraw.drawNumber,
            winningNumber: lastDraw.winningNumber,
            hasWinner: !!lastDraw.winnerUserId,
            winnerCoupon: lastDraw.winnerCoupon,
            prizeAmount: lastDraw.prizeAmount,
            drawDate: lastDraw.drawDate,
          }
        : null,
    };
  }

  // ============================
  // GET DASHBOARD STATS
  // ============================
  async getDashboardStats(userId: string) {
    const activeCycle = await this.cycleModel.findOne({ userId, status: 'active' });
    const allCycles = await this.cycleModel.find({ userId });
    const totalPayments = await this.paymentModel.countDocuments({ userId });
    const wins = await this.drawModel.find({ winnerUserId: userId });
    const totalWinnings = wins.reduce((sum, d) => sum + d.prizeAmount, 0);
    const walletBalance = await this.walletService.getBalance(userId);
    const totalParticipants = await this.cycleModel.countDocuments({
      $or: [{ status: 'active' }, { isPermanent: true, status: 'completed' }],
    });

    return {
      walletBalance,
      totalSavings: activeCycle ? activeCycle.totalSavings : 0,
      totalWinnings,
      totalCycles: allCycles.length,
      totalPayments,
      totalWins: wins.length,
      totalParticipants,
      activeCycle: activeCycle
        ? {
            couponNumber: activeCycle.couponNumber,
            currentDay: activeCycle.currentDay,
            daysLeft: this.CYCLE_DAYS - activeCycle.currentDay,
            totalSavings: activeCycle.totalSavings,
            prizeIfWinToday: this.getPrizeForDay(activeCycle.currentDay),
            canPayToday: this.canPayToday(activeCycle),
          }
        : null,
      permanentCoupons: allCycles
        .filter((c) => c.isPermanent)
        .map((c) => ({
          couponNumber: c.couponNumber,
          prizeAmount: c.permanentPrizeAmount,
        })),
    };
  }

  // ============================
  // NOTIFICATIONS
  // ============================
  private async createNotification(userId: string, title: string, description: string, category: string) {
    const notification = new this.notificationModel({
      userId,
      title,
      description,
      category,
      isRead: false,
    });
    return notification.save();
  }

  async getNotifications(userId: string, limit = 50) {
    return this.notificationModel.find({ userId }).sort({ createdAt: -1 }).limit(limit);
  }

  async markNotificationRead(userId: string, notificationId: string) {
    return this.notificationModel.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true },
      { new: true },
    );
  }

  async markAllNotificationsRead(userId: string) {
    await this.notificationModel.updateMany({ userId, isRead: false }, { isRead: true });
    return { message: 'All notifications marked as read' };
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationModel.countDocuments({ userId, isRead: false });
    return { count };
  }

  async deleteNotification(userId: string, notificationId: string) {
    return this.notificationModel.findOneAndDelete({ _id: notificationId, userId });
  }
}

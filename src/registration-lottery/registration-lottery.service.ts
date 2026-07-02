import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RegistrationLottery } from './schemas/registration-lottery.schema';
import { RegistrationDraw } from './schemas/registration-draw.schema';
import { RegistrationNotification } from './schemas/registration-notification.schema';
import { WalletService } from '../wallet/wallet.service';
import { UsersService } from '../users/users.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class RegistrationLotteryService {
  private readonly REGISTRATION_FEE = 1500;
  private readonly PRIZE_AMOUNT = 1000;

  constructor(
    @InjectModel(RegistrationLottery.name)
    private readonly lotteryModel: Model<RegistrationLottery>,
    @InjectModel(RegistrationDraw.name)
    private readonly drawModel: Model<RegistrationDraw>,
    @InjectModel(RegistrationNotification.name)
    private readonly notificationModel: Model<RegistrationNotification>,
    private readonly walletService: WalletService,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
  ) {}

  private generateCoupon(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private generateWinningNumber(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private isSameDay(firstDate?: Date | null, secondDate: Date = new Date()): boolean {
    if (!firstDate) return false;
    const a = new Date(firstDate);
    return (
      a.getFullYear() === secondDate.getFullYear() &&
      a.getMonth() === secondDate.getMonth() &&
      a.getDate() === secondDate.getDate()
    );
  }

  private getNextEligiblePlayAt(lastPlayedAt?: Date | null): Date | null {
    if (!lastPlayedAt) {
      return null;
    }

    const nextEligibleAt = new Date(lastPlayedAt);
    nextEligibleAt.setHours(24, 0, 0, 0);
    return nextEligibleAt;
  }

  // Pay the one-time registration fee and unlock daily play. Assigns a
  // permanent, unique 6-digit token that never changes for this user.
  async payRegistrationFee(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.registrationFeePaid) {
      return {
        message: 'Registration is already activated. You can play daily.',
        registrationFeePaid: true,
      };
    }

    // Check wallet balance
    const balance = await this.walletService.getBalance(userId);
    if (balance < this.REGISTRATION_FEE) {
      throw new BadRequestException(
        `Insufficient wallet balance. You need PKR ${this.REGISTRATION_FEE}. Current balance: PKR ${balance}`,
      );
    }

    // Debit wallet
    await this.walletService.debit(userId, this.REGISTRATION_FEE);

    // Generate the permanent unique token for this user.
    let coupon = this.generateCoupon();
    while (await this.lotteryModel.findOne({ couponNumber: coupon })) {
      coupon = this.generateCoupon();
    }

    const lottery = new this.lotteryModel({
      userId: new Types.ObjectId(userId),
      couponNumber: coupon,
      isActive: true,
      totalWinnings: 0,
      winCount: 0,
      pendingDraw: false,
    });
    await lottery.save();

    // Update user
    await this.usersService.updateProfile(userId, {
      registrationFeePaid: true,
      registrationCoupon: coupon,
    } as any);

    // Notification
    await this.createNotification(
      userId,
      'Registration activated',
      `PKR ${this.REGISTRATION_FEE} deducted. Your permanent token is ${coupon}. You can now play the lottery once per day.`,
      'REGISTRATION',
    );

    return {
      message: 'Registration activated. Your permanent token has been assigned. You can now play once per day.',
      registrationFeePaid: true,
      couponNumber: coupon,
    };
  }

  // Opt the user's permanent token into today's draw. Can only be done once per day.
  async playDailyLottery(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (!user.registrationFeePaid) {
      throw new BadRequestException('Please pay the one-time registration fee first.');
    }

    const lottery = await this.lotteryModel.findOne({ userId: new Types.ObjectId(userId) });
    if (!lottery) {
      throw new NotFoundException('No permanent token found. Please pay the registration fee first.');
    }

    const now = new Date();
    if (this.isSameDay(lottery.lastPlayedAt, now)) {
      throw new BadRequestException('You have already played today. Come back tomorrow!');
    }

    lottery.pendingDraw = true;
    lottery.lastPlayedAt = now;
    await lottery.save();

    await this.createNotification(
      userId,
      'Daily lottery entry confirmed',
      `Your permanent token ${lottery.couponNumber} is entered into the next draw.`,
      'REGISTRATION',
    );

    return {
      message: 'Your token is entered for today. Wait for the next draw result.',
      couponNumber: lottery.couponNumber,
      canPlayToday: false,
      nextEligiblePlayAt: this.getNextEligiblePlayAt(now),
    };
  }

  // Get my lottery info
  async getMyLotteryInfo(userId: string) {
    const user = await this.usersService.findById(userId);
    const lottery = await this.lotteryModel.findOne({ userId: new Types.ObjectId(userId) });

    const membershipPaid = Boolean(user?.registrationFeePaid);
    const canPlayToday = membershipPaid && !this.isSameDay(lottery?.lastPlayedAt);

    return {
      hasPaid: membershipPaid,
      membershipPaid,
      canPlayToday,
      nextEligiblePlayAt: canPlayToday ? null : this.getNextEligiblePlayAt(lottery?.lastPlayedAt),
      lottery: lottery ? {
        id: lottery._id,
        couponNumber: lottery.couponNumber,
        isActive: lottery.isActive,
        totalWinnings: lottery.totalWinnings,
        winCount: lottery.winCount,
        lastPlayedAt: lottery.lastPlayedAt,
        pendingDraw: lottery.pendingDraw,
      } : null,
    };
  }

  // Execute lucky draw (called by scheduler)
  async executeLuckyDraw() {
    const pendingLotteries = await this.lotteryModel.find({ isActive: true, pendingDraw: true });

    if (pendingLotteries.length === 0) {
      return { message: 'No participants', draw: null };
    }

    const winningNumber = this.generateWinningNumber();
    const winner = pendingLotteries.find((l) => l.couponNumber === winningNumber);

    const lastDraw = await this.drawModel.findOne().sort({ drawNumber: -1 });
    const drawNumber = lastDraw ? lastDraw.drawNumber + 1 : 1;

    let winnerUserId: string | undefined;
    let winnerCoupon: string | undefined;

    if (winner) {
      winnerUserId = winner.userId.toString();
      winnerCoupon = winner.couponNumber;

      // Credit prize to wallet
      await this.walletService.credit(winnerUserId, this.PRIZE_AMOUNT);

      // Update stats
      winner.totalWinnings += this.PRIZE_AMOUNT;
      winner.winCount += 1;
      await winner.save();

      // Get user for email
      const user = await this.usersService.findById(winnerUserId);

      // Email notification
      if (user) {
        await this.mailerService.sendLotteryWinEmail(
          user.email,
          user.name,
          winnerCoupon,
          this.PRIZE_AMOUNT,
          'Registration Lottery',
        );
      }

      // In-app notification
      await this.createNotification(
        winnerUserId,
        '🎉 YOU WON!',
        `Your token ${winnerCoupon} won PKR ${this.PRIZE_AMOUNT} in Registration Lottery Draw #${drawNumber}!`,
        'WIN',
      );
    }

    for (const lottery of pendingLotteries) {
      if (winner && lottery._id.toString() === winner._id.toString()) {
        continue;
      }

      await this.createNotification(
        lottery.userId.toString(),
        'Try again next round',
        `Your token ${lottery.couponNumber} was not selected this time. Play again tomorrow.`,
        'REGISTRATION',
      );
    }

    // Today's entries are consumed by this draw; the permanent token remains active.
    await this.lotteryModel.updateMany(
      { _id: { $in: pendingLotteries.map((lottery) => lottery._id) } },
      { $set: { pendingDraw: false } },
    );

    // Record draw
    const draw = new this.drawModel({
      drawNumber,
      winningNumber,
      winnerUserId,
      winnerCoupon,
      prizeAmount: winner ? this.PRIZE_AMOUNT : 0,
      totalParticipants: pendingLotteries.length,
      drawDate: new Date(),
      status: 'completed',
    });
    await draw.save();

    return {
      draw: {
        drawNumber,
        winningNumber,
        hasWinner: !!winner,
        winnerCoupon,
        prizeAmount: winner ? this.PRIZE_AMOUNT : 0,
        totalParticipants: pendingLotteries.length,
        drawDate: draw.drawDate,
      },
    };
  }

  // Dashboard stats
  async getDashboardStats(userId: string) {
    const user = await this.usersService.findById(userId);
    const lottery = await this.lotteryModel.findOne({ userId: new Types.ObjectId(userId) });
    const walletBalance = await this.walletService.getBalance(userId);
    const totalParticipants = await this.lotteryModel.countDocuments({ isActive: true, pendingDraw: true });
    const wins = await this.drawModel.find({ winnerUserId: userId }).sort({ drawDate: -1 });
    const totalWinnings = wins.reduce((sum, d) => sum + d.prizeAmount, 0);
    const membershipPaid = Boolean(user?.registrationFeePaid);
    const canPlayToday = membershipPaid && !this.isSameDay(lottery?.lastPlayedAt);

    return {
      walletBalance,
      hasPaid: membershipPaid,
      membershipPaid,
      canPlayToday,
      nextEligiblePlayAt: canPlayToday ? null : this.getNextEligiblePlayAt(lottery?.lastPlayedAt),
      couponNumber: lottery?.couponNumber || null,
      totalWinnings,
      winCount: lottery?.winCount || 0,
      totalParticipants,
      prizePerWin: this.PRIZE_AMOUNT,
      recentWins: wins.slice(0, 5),
    };
  }

  // Draw history
  async getDrawHistory(limit = 20) {
    return this.drawModel.find().sort({ drawDate: -1 }).limit(limit);
  }

  // Next draw info
  async getNextDrawInfo() {
    const lastDraw = await this.drawModel.findOne().sort({ drawDate: -1 });
    const totalParticipants = await this.lotteryModel.countDocuments({ isActive: true, pendingDraw: true });

    const now = new Date();
    let nextDrawTime: Date;
    let drawNumber: number;

    if (!lastDraw) {
      nextDrawTime = new Date(now);
      nextDrawTime.setSeconds(0, 0);
      nextDrawTime.setMinutes(now.getMinutes() + 1);
      drawNumber = 1;
    } else {
      nextDrawTime = new Date(lastDraw.drawDate.getTime() + 60000);
      drawNumber = lastDraw.drawNumber + 1;
    }

    const countdown = Math.max(0, Math.floor((nextDrawTime.getTime() - now.getTime()) / 1000));

    return {
      serverTime: now,
      nextDrawTime,
      countdown,
      drawNumber,
      totalParticipants,
      prizeAmount: this.PRIZE_AMOUNT,
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

  // Winning history for user
  async getWinningHistory(userId: string) {
    const draws = await this.drawModel.find({ winnerUserId: userId }).sort({ drawDate: -1 });
    const totalWon = draws.reduce((sum, d) => sum + d.prizeAmount, 0);
    return { wins: draws, totalWon, totalWins: draws.length };
  }

  // Notifications
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

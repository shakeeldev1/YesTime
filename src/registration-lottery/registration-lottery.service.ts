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

  // Pay registration fee and get permanent coupon
  async payRegistrationFee(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Check if already paid
    const existing = await this.lotteryModel.findOne({ userId: new Types.ObjectId(userId) });
    if (existing) {
      throw new BadRequestException('Registration fee already paid. Your coupon: ' + existing.couponNumber);
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

    // Generate unique coupon
    let coupon = this.generateCoupon();
    while (await this.lotteryModel.findOne({ couponNumber: coupon })) {
      coupon = this.generateCoupon();
    }

    // Create lottery entry
    const lottery = new this.lotteryModel({
      userId: new Types.ObjectId(userId),
      couponNumber: coupon,
      isActive: true,
    });
    await lottery.save();

    // Update user
    await this.usersService.updateProfile(userId, {
      registrationFeePaid: true,
      registrationCoupon: coupon,
    } as any);

    // Generate referral code if not already present
    const fullUser = await this.usersService.findById(userId);
    if (!fullUser?.referralCode) {
      const referralCode = await this.usersService.generateUniqueReferralCode();
      await this.usersService.updateProfile(userId, { referralCode } as any);
    }

    // Send email
    await this.mailerService.sendRegistrationCouponEmail(user.email, user.name, coupon);

    // Notification
    await this.createNotification(
      userId,
      'Registration Fee Paid!',
      `PKR ${this.REGISTRATION_FEE} deducted. Your permanent coupon: ${coupon}. You're now in every registration lottery draw for PKR ${this.PRIZE_AMOUNT} each time!`,
      'REGISTRATION',
    );

    return {
      message: 'Registration fee paid successfully!',
      couponNumber: coupon,
      prizePerWin: this.PRIZE_AMOUNT,
    };
  }

  // Get my lottery info
  async getMyLotteryInfo(userId: string) {
    const lottery = await this.lotteryModel.findOne({ userId: new Types.ObjectId(userId) });
    if (!lottery) {
      return { hasPaid: false, lottery: null };
    }

    return {
      hasPaid: true,
      lottery: {
        id: lottery._id,
        couponNumber: lottery.couponNumber,
        isActive: lottery.isActive,
        totalWinnings: lottery.totalWinnings,
        winCount: lottery.winCount,
      },
    };
  }

  // Execute lucky draw (called by scheduler)
  async executeLuckyDraw() {
    const activeLotteries = await this.lotteryModel.find({ isActive: true });

    if (activeLotteries.length === 0) {
      return { message: 'No participants', draw: null };
    }

    const winningNumber = this.generateWinningNumber();
    const winner = activeLotteries.find((l) => l.couponNumber === winningNumber);

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
        `Your coupon ${winnerCoupon} won PKR ${this.PRIZE_AMOUNT} in Registration Lottery Draw #${drawNumber}!`,
        'WIN',
      );
    }

    // Record draw
    const draw = new this.drawModel({
      drawNumber,
      winningNumber,
      winnerUserId,
      winnerCoupon,
      prizeAmount: winner ? this.PRIZE_AMOUNT : 0,
      totalParticipants: activeLotteries.length,
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
        totalParticipants: activeLotteries.length,
        drawDate: draw.drawDate,
      },
    };
  }

  // Dashboard stats
  async getDashboardStats(userId: string) {
    const lottery = await this.lotteryModel.findOne({ userId: new Types.ObjectId(userId) });
    const walletBalance = await this.walletService.getBalance(userId);
    const totalParticipants = await this.lotteryModel.countDocuments({ isActive: true });
    const wins = await this.drawModel.find({ winnerUserId: userId }).sort({ drawDate: -1 });
    const totalWinnings = wins.reduce((sum, d) => sum + d.prizeAmount, 0);

    return {
      walletBalance,
      hasPaid: !!lottery,
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
    const totalParticipants = await this.lotteryModel.countDocuments({ isActive: true });

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

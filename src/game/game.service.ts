import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { GameCycle } from './schemas/game-cycle.schema';
import { GameDraw } from './schemas/game-draw.schema';
import { GamePayment } from './schemas/game-payment.schema';
import { GameNotification } from './schemas/game-notification.schema';
import { WalletService } from '../wallet/wallet.service';
import { User } from '../users/schemas/user.schema';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class GameService {
  private readonly INVESTMENT_AMOUNT = 50;
  private readonly REWARD_PER_INVESTMENT = 1000;
  private readonly MAX_REWARD = 30000;
  private readonly drawLock = { active: false };

  constructor(
    @InjectModel(GameCycle.name) private readonly cycleModel: Model<GameCycle>,
    @InjectModel(GameDraw.name) private readonly drawModel: Model<GameDraw>,
    @InjectModel(GamePayment.name) private readonly paymentModel: Model<GamePayment>,
    @InjectModel(GameNotification.name) private readonly notificationModel: Model<GameNotification>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly walletService: WalletService,
    private readonly mailerService: MailerService,
  ) {}

  private generateCoupon(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private generateWinningNumber(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private normalizeDate(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private isSameDay(a?: Date | null, b: Date = new Date()): boolean {
    if (!a) return false;
    return this.normalizeDate(new Date(a)).getTime() === this.normalizeDate(b).getTime();
  }

  private getTokenInvestedValue(token: GameCycle): number {
    const legacyAmount = Number((token as any).totalSavings || 0);
    const invested = Number((token as any).totalInvested || 0);
    if (invested > 0) return invested;
    if (legacyAmount > 0) return legacyAmount;
    return Math.max(50, Number((token as any).currentDay || 1) * this.INVESTMENT_AMOUNT);
  }

  private getTokenRewardValue(token: GameCycle): number {
    const invested = this.getTokenInvestedValue(token);
    return Math.min(invested * 20, this.MAX_REWARD);
  }

  private getCurrentDayValue(token: GameCycle): number {
    const invested = this.getTokenInvestedValue(token);
    return Math.max(1, Math.ceil(invested / this.INVESTMENT_AMOUNT));
  }

  private isPermanentToken(token: GameCycle): boolean {
    return Boolean((token as any).isPermanent) || this.getTokenRewardValue(token) >= this.MAX_REWARD;
  }

  // A token can only be invested in (paid for) once per calendar day.
  private hasInvestedToday(token: GameCycle, referenceDate = new Date()): boolean {
    return this.isSameDay((token as any).lastPaymentDate, referenceDate);
  }

  // A token can only be played (entered into a draw) once per calendar day, and only
  // after today's investment has been made.
  private hasPlayedToday(token: GameCycle, referenceDate = new Date()): boolean {
    return this.isSameDay((token as any).lastParticipatedAt, referenceDate);
  }

  private isQueued(token: GameCycle): boolean {
    return Boolean((token as any).queuedForNextRound);
  }

  private canParticipateToday(token: GameCycle, referenceDate = new Date()): boolean {
    if (this.isPermanentToken(token)) return false;
    if (this.isQueued(token)) return false;
    if (!this.hasInvestedToday(token, referenceDate)) return false;
    if (this.hasPlayedToday(token, referenceDate)) return false;
    return true;
  }

  private getNextEligiblePlayDateForToken(token: GameCycle, referenceDate = new Date()): Date {
    if (this.isPermanentToken(token)) {
      return this.normalizeDate(referenceDate);
    }
    if (!this.hasInvestedToday(token, referenceDate) || !this.hasPlayedToday(token, referenceDate)) {
      // Either today's investment hasn't been made yet, or it has but hasn't been played yet.
      // Either way, the next actionable date is today.
      return this.normalizeDate(referenceDate);
    }
    const tomorrow = new Date(referenceDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.normalizeDate(tomorrow);
  }

  private getTokenStatus(token: GameCycle, referenceDate = new Date()): string {
    if (this.isQueued(token)) return 'queued';
    if (this.isPermanentToken(token)) return 'permanent';
    if (this.hasPlayedToday(token, referenceDate)) return 'played';
    return 'active';
  }

  private buildTokenView(token: GameCycle, referenceDate = new Date()) {
    const invested = this.getTokenInvestedValue(token);
    const reward = this.getTokenRewardValue(token);
    const nextEligiblePlayDate = this.getNextEligiblePlayDateForToken(token, referenceDate);
    const currentDay = this.getCurrentDayValue(token);
    const eligibleToday = this.canParticipateToday(token, referenceDate);
    const queued = this.isQueued(token);
    const investedToday = this.hasInvestedToday(token, referenceDate);
    const playedToday = this.hasPlayedToday(token, referenceDate);

    return {
      id: token._id,
      tokenId: token._id,
      tokenNumber: (token as any).tokenNumber || token.couponNumber,
      couponNumber: token.couponNumber,
      userId: token.userId,
      cycleDateLabel: this.normalizeDate((token as any).cycleStartDate || new Date()).toISOString().slice(0, 10),
      totalInvested: invested,
      totalSavings: invested,
      currentReward: reward,
      prizeIfWinToday: reward,
      totalWins: Number((token as any).totalWins || 0),
      totalLosses: Number((token as any).totalLosses || 0),
      isPermanent: this.isPermanentToken(token),
      permanentPrizeAmount: Number((token as any).permanentPrizeAmount || (this.isPermanentToken(token) ? this.MAX_REWARD : 0)),
      autoJoinEnabledForCurrentCycle: Boolean((token as any).autoJoinEnabledForCurrentCycle),
      hasPlayedCurrentCycle: playedToday,
      playsPurchased: investedToday ? 1 : 0,
      playsUsed: playedToday ? 1 : 0,
      playsRemaining: investedToday && !playedToday ? 1 : 0,
      queuedForNextRound: queued,
      participationMode: (token as any).participationMode || 'none',
      currentDay,
      daysLeft: Math.max(0, 30 - currentDay),
      status: this.getTokenStatus(token, referenceDate),
      cycleStartDate: (token as any).cycleStartDate || null,
      cycleEndDate: (token as any).cycleEndDate || null,
      lastPaymentDate: (token as any).lastPaymentDate || null,
      nextEligiblePlayDate,
      canPlayNow: eligibleToday,
      canAutoJoin: eligibleToday,
      canInvestToday: !investedToday && !this.isPermanentToken(token),
      playStatus: queued ? 'queued' : eligibleToday ? 'eligible' : this.isPermanentToken(token) ? 'permanent' : 'locked',
    };
  }

  private async savePaymentRecord(
    session: ClientSession | null,
    data: Partial<GamePayment> & { userId: string; cycleId: string; couponNumber: string; paymentDate: Date; amount: number; dayNumber: number },
  ) {
    const payment = new this.paymentModel(data as any);
    await payment.save({ session: session || undefined });
    return payment;
  }

  private async findMostRelevantToken(userId: string, tokenId?: string) {
    const tokens = await this.cycleModel.find({ userId }).sort({ createdAt: -1 });
    if (tokenId) {
      const byId = tokens.find((token) => token._id.toString() === tokenId);
      if (!byId) {
        throw new NotFoundException('Token not found');
      }
      return byId;
    }

    const now = new Date();
    const eligibleToday = tokens.filter((token) => this.canParticipateToday(token, now));
    if (eligibleToday.length > 0) {
      return eligibleToday.sort((a, b) => this.getTokenRewardValue(b) - this.getTokenRewardValue(a))[0];
    }

    return tokens[0] || null;
  }

  // Pay today's PKR 50 investment. Upgrades the user's currently open (non-permanent)
  // token, or creates a brand new one if none exists yet / the previous one is permanent.
  async joinGame(userId: string) {
    const now = new Date();
    const session = await this.cycleModel.db.startSession();

    try {
      let tokenResult: GameCycle | null = null;

      await session.withTransaction(async () => {
        const existingOpenToken = await this.cycleModel
          .findOne({ userId, isPermanent: false })
          .sort({ createdAt: -1 })
          .session(session);

        if (existingOpenToken && this.hasInvestedToday(existingOpenToken, now)) {
          throw new BadRequestException('You have already invested today. Come back tomorrow.');
        }

        await this.walletService.debit(userId, this.INVESTMENT_AMOUNT, 'Token investment', session);

        if (existingOpenToken) {
          const nextInvested = this.getTokenInvestedValue(existingOpenToken) + this.INVESTMENT_AMOUNT;
          const nextReward = Math.min(nextInvested * 20, this.MAX_REWARD);
          existingOpenToken.set({
            tokenNumber: (existingOpenToken as any).tokenNumber || existingOpenToken.couponNumber,
            totalInvested: nextInvested,
            currentReward: nextReward,
            currentDay: Math.max(1, Math.ceil(nextInvested / this.INVESTMENT_AMOUNT)),
            totalSavings: nextInvested,
            dailyAmount: this.INVESTMENT_AMOUNT,
            cycleDays: 30,
            status: 'active',
            lastPaymentDate: now,
            paymentDates: [...(((existingOpenToken as any).paymentDates as Date[]) || []), now],
            isPermanent: nextReward >= this.MAX_REWARD,
            permanentPrizeAmount: nextReward >= this.MAX_REWARD ? this.MAX_REWARD : 0,
          });
          tokenResult = await existingOpenToken.save({ session });
        } else {
          const tokenNumber = this.generateCoupon();
          const newToken = new this.cycleModel({
            userId,
            couponNumber: tokenNumber,
            tokenNumber,
            cycleDate: 1,
            totalInvested: this.INVESTMENT_AMOUNT,
            currentReward: Math.min(this.INVESTMENT_AMOUNT * 20, this.MAX_REWARD),
            totalWins: 0,
            totalLosses: 0,
            currentDay: 1,
            totalSavings: this.INVESTMENT_AMOUNT,
            dailyAmount: this.INVESTMENT_AMOUNT,
            cycleDays: 30,
            status: 'active',
            cycleStartDate: now,
            isPermanent: false,
            permanentPrizeAmount: 0,
            lastPaymentDate: now,
            paymentDates: [now],
            autoJoinEnabledForCurrentCycle: false,
            hasPlayedCurrentCycle: false,
            queuedForNextRound: false,
            participationMode: 'none',
          });
          tokenResult = await newToken.save({ session });
        }

        if (!tokenResult) {
          throw new BadRequestException('Unable to create token');
        }

        await this.savePaymentRecord(session, {
          userId,
          cycleId: tokenResult._id.toString(),
          couponNumber: tokenResult.couponNumber,
          tokenId: tokenResult._id.toString(),
          tokenNumber: (tokenResult as any).tokenNumber || tokenResult.couponNumber,
          cycleDate: this.getCurrentDayValue(tokenResult),
          amount: this.INVESTMENT_AMOUNT,
          dayNumber: this.getCurrentDayValue(tokenResult),
          action: 'investment',
          participationMode: 'manual',
          rewardAmount: this.getTokenRewardValue(tokenResult),
          paymentDate: now,
          status: 'completed',
        } as any);
      });

      const walletBalance = await this.walletService.getBalance(userId);
      return {
        message: tokenResult && this.getTokenInvestedValue(tokenResult) === this.INVESTMENT_AMOUNT ? 'Token created successfully.' : 'Token upgraded successfully.',
        walletBalance,
        token: tokenResult ? this.buildTokenView(tokenResult, now) : null,
      };
    } finally {
      await session.endSession();
    }
  }

  async playNow(userId: string, tokenId?: string) {
    const now = new Date();
    const token = await this.findMostRelevantToken(userId, tokenId);
    if (!token) {
      throw new NotFoundException('No token found. Invest ₹50 first.');
    }

    if (!this.canParticipateToday(token, now)) {
      throw new BadRequestException('You need to invest today before you can play. Call join to invest ₹50, then play.');
    }

    if (this.isQueued(token) && (token as any).participationMode === 'auto') {
      throw new BadRequestException('Auto join is already enabled for this token.');
    }

    if ((token as any).queuedForNextRound && (token as any).participationMode === 'play') {
      return {
        message: 'Token is already queued for play.',
        token: this.buildTokenView(token, now),
      };
    }

    token.set({
      queuedForNextRound: true,
      participationMode: 'play',
      autoJoinEnabledForCurrentCycle: false,
    });
    await token.save();

    return {
      message: 'Token queued for Play Now. It will join the next draw once.',
      token: this.buildTokenView(token, now),
    };
  }

  async autoJoinNextRound(userId: string, tokenId?: string) {
    const now = new Date();
    const token = await this.findMostRelevantToken(userId, tokenId);
    if (!token) {
      throw new NotFoundException('No token found. Invest ₹50 first.');
    }

    if (!this.canParticipateToday(token, now)) {
      throw new BadRequestException('You need to invest today before you can auto-join. Call join to invest ₹50, then auto-join.');
    }

    if ((token as any).queuedForNextRound && (token as any).participationMode === 'play') {
      throw new BadRequestException('Play Now is already queued for this token.');
    }

    if ((token as any).queuedForNextRound && (token as any).participationMode === 'auto') {
      return {
        message: 'Auto join is already enabled for this token.',
        token: this.buildTokenView(token, now),
      };
    }

    token.set({
      queuedForNextRound: true,
      autoJoinEnabledForCurrentCycle: true,
      participationMode: 'auto',
    });
    await token.save();

    return {
      message: 'Auto join enabled for the next draw. It will reset after one participation.',
      token: this.buildTokenView(token, now),
    };
  }

  async makeDailyPayment(userId: string) {
    return this.playNow(userId);
  }

  async getActiveCycle(userId: string) {
    const now = new Date();
    const tokens = await this.cycleModel.find({ userId }).sort({ createdAt: -1 });
    if (tokens.length === 0) {
      return { hasCycle: false, cycle: null, tokens: [] };
    }

    const activeToken = tokens.find((token) => this.canParticipateToday(token, now) && this.isQueued(token))
      || tokens.find((token) => this.canParticipateToday(token, now))
      || tokens[0];

    return {
      hasCycle: true,
      cycle: activeToken ? this.buildTokenView(activeToken, now) : null,
      activeToken: activeToken ? this.buildTokenView(activeToken, now) : null,
      tokens: tokens.map((token) => this.buildTokenView(token, now)),
      nextEligiblePlayDate: tokens
        .map((token) => this.getNextEligiblePlayDateForToken(token, now))
        .sort((a, b) => a.getTime() - b.getTime())[0] || null,
    };
  }

  async getSavings(userId: string) {
    const now = new Date();
    const tokens = await this.cycleModel.find({ userId }).sort({ createdAt: -1 });
    const totalInvested = tokens.reduce((sum, token) => sum + this.getTokenInvestedValue(token), 0);
    const totalWinnings = await this.drawModel.find({ winnerUserId: userId }).then((draws) => draws.reduce((sum, draw) => sum + draw.prizeAmount, 0));
    const permanentTokens = tokens.filter((token) => this.isPermanentToken(token));
    const activeToken = tokens.find((token) => this.canParticipateToday(token, now) && this.isQueued(token))
      || tokens.find((token) => this.canParticipateToday(token, now))
      || tokens[0] || null;

    return {
      activeSavings: totalInvested,
      completedSavings: permanentTokens.reduce((sum, token) => sum + this.getTokenInvestedValue(token), 0),
      totalWinnings,
      totalSavings: totalInvested,
      activeCycle: activeToken ? {
        tokenNumber: (activeToken as any).tokenNumber || activeToken.couponNumber,
        couponNumber: activeToken.couponNumber,
        currentDay: this.getCurrentDayValue(activeToken),
        totalSavings: this.getTokenInvestedValue(activeToken),
        currentReward: this.getTokenRewardValue(activeToken),
        nextEligiblePlayDate: this.getNextEligiblePlayDateForToken(activeToken, now),
      } : null,
      completedCyclesCount: permanentTokens.length,
      wonCyclesCount: tokens.reduce((sum, token) => sum + Number((token as any).totalWins || 0), 0),
      totalTokens: tokens.length,
    };
  }

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

  async getUserCoupons(userId: string) {
    const tokens = await this.cycleModel.find({ userId }).sort({ createdAt: -1 });
    return tokens.map((token) => this.buildTokenView(token));
  }

  async executeLuckyDraw() {
    if (this.drawLock.active) {
      return { message: 'Draw already in progress', draw: null };
    }

    this.drawLock.active = true;
    const session = await this.cycleModel.db.startSession();
    const now = new Date();

    try {
      const queuedTokens = await this.cycleModel.find({ queuedForNextRound: true }).sort({ createdAt: 1 });
      const winningNumber = this.generateWinningNumber();
      const lastDraw = await this.drawModel.findOne().sort({ drawNumber: -1 });
      const drawNumber = lastDraw ? lastDraw.drawNumber + 1 : 1;

      let winnerToken: GameCycle | null = queuedTokens.find((token) => token.couponNumber === winningNumber) || null;
      let prizeAmount = 0;
      let winnerUserId: string | undefined;
      let winnerCoupon: string | undefined;
      let winnerTokenId: string | undefined;

      await session.withTransaction(async () => {
        if (winnerToken) {
          prizeAmount = this.getTokenRewardValue(winnerToken);
          winnerUserId = winnerToken.userId;
          winnerCoupon = winnerToken.couponNumber;
          winnerTokenId = winnerToken._id.toString();

          await this.walletService.credit(winnerToken.userId, prizeAmount, 'Game token win', session);

          winnerToken.set({
            totalWins: Number((winnerToken as any).totalWins || 0) + 1,
            hasPlayedCurrentCycle: true,
            lastParticipatedAt: now,
            queuedForNextRound: false,
            autoJoinEnabledForCurrentCycle: false,
            participationMode: 'none',
          });
          await winnerToken.save({ session });

          const winnerUser = await this.userModel.findById(winnerToken.userId).session(session);
          if (winnerUser) {
            try {
              await this.mailerService.sendLotteryWinEmail(
                winnerUser.email,
                winnerUser.name,
                winnerToken.couponNumber,
                prizeAmount,
                'Game Dashboard',
              );
            } catch {
              // Email failures should not block the draw.
            }
          }

          await this.createNotification(
            winnerToken.userId,
            '🎉 YOU WON!',
            `Congratulations! Your token ${winnerToken.couponNumber} won PKR ${prizeAmount} in Draw #${drawNumber}.`,
            'WIN',
            session,
          );
        }

        for (const token of queuedTokens) {
          if (winnerToken && token._id.toString() === winnerToken._id.toString()) {
            continue;
          }

          token.set({
            totalLosses: Number((token as any).totalLosses || 0) + 1,
            hasPlayedCurrentCycle: true,
            lastParticipatedAt: now,
            queuedForNextRound: false,
            autoJoinEnabledForCurrentCycle: false,
            participationMode: 'none',
          });
          await token.save({ session });
        }

        const draw = new this.drawModel({
          drawNumber,
          winningNumber,
          winnerTokenId,
          winnerUserId,
          winnerCoupon,
          prizeAmount,
          totalParticipants: queuedTokens.length,
          participantTokenIds: queuedTokens.map((token) => token._id.toString()),
          drawDate: now,
          status: 'completed',
        });
        await draw.save({ session });
      });

      return {
        draw: {
          drawNumber,
          winningNumber,
          hasWinner: Boolean(winnerToken),
          winnerCoupon,
          prizeAmount,
          totalParticipants: queuedTokens.length,
          drawDate: now,
          winnerTokenId,
        },
      };
    } finally {
      this.drawLock.active = false;
      await session.endSession();
    }
  }

  async triggerManualDraw() {
    return this.executeLuckyDraw();
  }

  async getDrawHistory(limit = 20) {
    return this.drawModel.find().sort({ drawDate: -1 }).limit(limit);
  }

  async getWinningHistory(userId: string) {
    const draws = await this.drawModel.find({ winnerUserId: userId }).sort({ drawDate: -1 });
    const totalWon = draws.reduce((sum, draw) => sum + draw.prizeAmount, 0);
    return { wins: draws, totalWon, totalWins: draws.length };
  }

  async getNextDrawInfo() {
    const lastDraw = await this.drawModel.findOne().sort({ drawDate: -1 });
    const totalParticipants = await this.cycleModel.countDocuments({ queuedForNextRound: true });
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
      lastDraw: lastDraw
        ? {
            drawNumber: lastDraw.drawNumber,
            winningNumber: lastDraw.winningNumber,
            hasWinner: Boolean(lastDraw.winnerUserId),
            winnerCoupon: lastDraw.winnerCoupon,
            prizeAmount: lastDraw.prizeAmount,
            drawDate: lastDraw.drawDate,
            winnerTokenId: (lastDraw as any).winnerTokenId || null,
          }
        : null,
    };
  }

  async getDashboardStats(userId: string) {
    const now = new Date();
    const tokens = await this.cycleModel.find({ userId }).sort({ createdAt: -1 });
    const walletBalance = await this.walletService.getBalance(userId);
    const wins = await this.drawModel.find({ winnerUserId: userId });
    const totalWinnings = wins.reduce((sum, draw) => sum + draw.prizeAmount, 0);
    const totalInvested = tokens.reduce((sum, token) => sum + this.getTokenInvestedValue(token), 0);
    const queuedTokens = tokens.filter((token) => this.isQueued(token));
    const eligibleTokens = tokens.filter((token) => this.canParticipateToday(token, now));
    const activeToken = queuedTokens[0] || eligibleTokens[0] || tokens[0] || null;
    const nextEligiblePlayDate = tokens
      .map((token) => this.getNextEligiblePlayDateForToken(token, now))
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;

    return {
      walletBalance,
      totalInvested,
      totalSavings: totalInvested,
      totalWinnings,
      totalCycles: tokens.length,
      totalPayments: await this.paymentModel.countDocuments({ userId, action: 'investment' } as any),
      totalWins: wins.length,
      totalLosses: tokens.reduce((sum, token) => sum + Number((token as any).totalLosses || 0), 0),
      totalParticipants: await this.cycleModel.countDocuments({ queuedForNextRound: true }),
      activeCycle: activeToken ? this.buildTokenView(activeToken, now) : null,
      nextEligiblePlayDate,
      eligibleTokens: eligibleTokens.map((token) => this.buildTokenView(token, now)),
      queuedTokens: queuedTokens.map((token) => this.buildTokenView(token, now)),
      tokens: tokens.map((token) => this.buildTokenView(token, now)),
      permanentCoupons: tokens
        .filter((token) => this.isPermanentToken(token))
        .map((token) => ({
          tokenNumber: (token as any).tokenNumber || token.couponNumber,
          couponNumber: token.couponNumber,
          prizeAmount: this.getTokenRewardValue(token),
          totalInvested: this.getTokenInvestedValue(token),
        })),
    };
  }

  private async createNotification(
    userId: string,
    title: string,
    description: string,
    category: string,
    session?: ClientSession,
  ) {
    const notification = new this.notificationModel({
      userId,
      title,
      description,
      category,
      isRead: false,
    });
    return notification.save({ session });
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

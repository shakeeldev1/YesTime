import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Shopkeeper } from './schemas/shopkeeper.schema';
import { CashbackPurchase } from './schemas/cashback-purchase.schema';
import { CashbackCycle } from './schemas/cashback-cycle.schema';
import { CashbackDraw } from './schemas/cashback-draw.schema';
import { CashbackNotification } from './schemas/cashback-notification.schema';
import { WalletService } from '../wallet/wallet.service';
import { RegisterShopkeeperDto, RecordPurchaseDto } from './dto/cashback.dto';
import { UsersService } from '../users/users.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class CashbackService {
  private readonly REGISTRATION_FEE = 1500;
  private readonly COMMISSION_RATE = 0.025; // 2.5%
  private readonly LEVEL_BASE = 1000; // Each level costs level × 1000
  private readonly MAX_LEVELS = 30;

  constructor(
    @InjectModel(Shopkeeper.name) private readonly shopkeeperModel: Model<Shopkeeper>,
    @InjectModel(CashbackPurchase.name) private readonly purchaseModel: Model<CashbackPurchase>,
    @InjectModel(CashbackCycle.name) private readonly cycleModel: Model<CashbackCycle>,
    @InjectModel(CashbackDraw.name) private readonly drawModel: Model<CashbackDraw>,
    @InjectModel(CashbackNotification.name) private readonly notificationModel: Model<CashbackNotification>,
    private readonly walletService: WalletService,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
  ) {}

  // ========== HELPERS ==========

  private generateCoupon(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private generateWinningNumber(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * Calculate how many levels a total shopping amount covers.
   * Level N costs N × 1000. Total cost for N levels = N(N+1)/2 × 1000
   */
  private calculateLevel(totalShopping: number): { level: number; committed: number; remaining: number } {
    let level = 0;
    let committed = 0;
    for (let n = 1; n <= this.MAX_LEVELS; n++) {
      const needed = n * this.LEVEL_BASE;
      if (committed + needed <= totalShopping) {
        committed += needed;
        level = n;
      } else {
        break;
      }
    }
    return { level, committed, remaining: totalShopping - committed };
  }

  private async ensureRegistrationFeeBalance(userId: string) {
    const balance = await this.walletService.getBalance(userId);
    if (balance < this.REGISTRATION_FEE) {
      throw new BadRequestException(
        `Insufficient wallet balance. You need PKR ${this.REGISTRATION_FEE} to submit shopkeeper request. Current balance: PKR ${balance}`,
      );
    }
  }

  // ========== SHOPKEEPER MANAGEMENT ==========

  /** User submits request to become shopkeeper (pending admin approval) */
  async requestShopkeeper(userId: string, dto: RegisterShopkeeperDto) {
    // NOTE: Registration fee payment will be integrated once payment gateway is available.
    const existing = await this.shopkeeperModel.findOne({ userId: new Types.ObjectId(userId) });
    if (existing) {
      if (existing.status === 'rejected') {
        // Allow re-applying
        existing.shopName = dto.shopName;
        existing.ownerName = dto.ownerName;
        existing.phone = dto.phone;
        existing.address = dto.address;
        existing.status = 'pending';
        await existing.save();
        
        // Update user's shopkeeper status to pending
        await this.usersService.updateProfile(userId, { shopkeeperStatus: 'pending' } as any);
        
        return { message: 'Shopkeeper request re-submitted for approval', shopkeeper: existing };
      }
      throw new BadRequestException('Shopkeeper request already exists');
    }

    const shopkeeper = new this.shopkeeperModel({
      userId: new Types.ObjectId(userId),
      shopName: dto.shopName,
      ownerName: dto.ownerName,
      phone: dto.phone,
      address: dto.address,
      status: 'pending',
      isRegistrationPaid: false,
      couponNumber: this.generateCoupon(),
    });
    await shopkeeper.save();

    // Update user's shopkeeper status to pending
    await this.usersService.updateProfile(userId, { shopkeeperStatus: 'pending' } as any);

    await this.createNotification(
      userId,
      'Request Submitted',
      `Your shopkeeper request for "${dto.shopName}" has been submitted. Waiting for admin approval.`,
      'SYSTEM',
    );

    return { message: 'Shopkeeper request submitted for admin approval', shopkeeper };
  }

  /** Legacy: Direct register (pays fee immediately, sets active) */
  async registerShopkeeper(userId: string, dto: RegisterShopkeeperDto) {
    const existing = await this.shopkeeperModel.findOne({ userId: new Types.ObjectId(userId) });
    if (existing) {
      throw new BadRequestException('Shopkeeper already registered');
    }

    const balance = await this.walletService.getBalance(userId);
    if (balance < this.REGISTRATION_FEE) {
      throw new BadRequestException(`Insufficient wallet balance. Registration fee is PKR ${this.REGISTRATION_FEE}`);
    }

    await this.walletService.debit(userId, this.REGISTRATION_FEE);

    const shopkeeper = new this.shopkeeperModel({
      userId: new Types.ObjectId(userId),
      shopName: dto.shopName,
      ownerName: dto.ownerName,
      phone: dto.phone,
      address: dto.address,
      isRegistrationPaid: true,
      status: 'active',
      couponNumber: this.generateCoupon(),
    });
    await shopkeeper.save();

    // Also update role and shopkeeper status
    await this.usersService.updateRole(userId, 'shopkeeper');
    await this.usersService.updateProfile(userId, { shopkeeperStatus: 'approved' } as any);

    await this.createNotification(
      userId,
      'Shop Registered!',
      `Your shop "${dto.shopName}" has been registered. PKR ${this.REGISTRATION_FEE} registration fee deducted from wallet.`,
      'SYSTEM',
    );

    return { message: 'Shopkeeper registered successfully', shopkeeper };
  }

  /** Admin approves pending shopkeeper request */
  async approveShopkeeper(shopkeeperId: string) {
    const shopkeeper = await this.shopkeeperModel.findById(shopkeeperId);
    if (!shopkeeper) throw new NotFoundException('Shopkeeper not found');
    if (shopkeeper.status !== 'pending') {
      throw new BadRequestException('Shopkeeper is not in pending status');
    }

    const userId = shopkeeper.userId.toString();

    // NOTE: Registration fee deduction will be handled once payment gateway is integrated.
    // For now, approve without charging the fee.

    shopkeeper.status = 'active';
    shopkeeper.isRegistrationPaid = false;
    await shopkeeper.save();

    // Update user role to shopkeeper
    await this.usersService.updateRole(userId, 'shopkeeper');

    await this.createNotification(
      userId,
      '🎉 Request Approved!',
      `Your shopkeeper request has been approved! You can now start selling.`,
      'SYSTEM',
    );

    // Send email notification
    const user = await this.usersService.findById(userId);
    if (user) {
      await this.mailerService.sendShopkeeperApprovalEmail(user.email, user.name, shopkeeper.shopName);
      // Also update shopkeeperStatus on user
      await this.usersService.updateProfile(userId, { shopkeeperStatus: 'approved' } as any);
    }

    return { message: 'Shopkeeper approved successfully', shopkeeper };
  }

  /** Admin rejects pending shopkeeper request */
  async rejectShopkeeper(shopkeeperId: string, reason?: string) {
    const shopkeeper = await this.shopkeeperModel.findById(shopkeeperId);
    if (!shopkeeper) throw new NotFoundException('Shopkeeper not found');
    if (shopkeeper.status !== 'pending') {
      throw new BadRequestException('Shopkeeper is not in pending status');
    }

    shopkeeper.status = 'rejected';
    await shopkeeper.save();

    await this.createNotification(
      shopkeeper.userId.toString(),
      'Request Rejected',
      reason || 'Your shopkeeper request has been rejected by admin.',
      'SYSTEM',
    );

    // Send email notification
    const user = await this.usersService.findById(shopkeeper.userId.toString());
    if (user) {
      await this.mailerService.sendShopkeeperRejectionEmail(user.email, user.name, shopkeeper.shopName, reason);
      await this.usersService.updateProfile(shopkeeper.userId.toString(), { shopkeeperStatus: 'rejected' } as any);
    }

    return { message: 'Shopkeeper rejected', shopkeeper };
  }

  /** Get pending shopkeeper requests */
  async getPendingShopkeepers() {
    const shopkeepers = await this.shopkeeperModel
      .find({ status: 'pending' })
      .populate('userId', 'name email phone referralCode totalReferralEarnings')
      .sort({ createdAt: -1 });

    const rows = await Promise.all(
      shopkeepers.map(async (shopkeeper: any) => {
        const userId = shopkeeper.userId?._id;
        const referralCount = userId ? await this.usersService.countReferrals(userId.toString()) : 0;
        return {
          ...shopkeeper.toObject(),
          referralCount,
        };
      }),
    );

    return rows;
  }

  /** Get shopkeeper by id */
  async getShopkeeperById(shopkeeperId: string) {
    return this.shopkeeperModel.findById(shopkeeperId).populate('userId', 'name email phone');
  }

  /** Get shopkeeper purchases (for shopkeeper dashboard) */
  async getShopkeeperPurchases(shopkeeperId: string, limit = 50) {
    return this.purchaseModel
      .find({ shopkeeperId: new Types.ObjectId(shopkeeperId) })
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Sales overview for shopkeeper used by graphs.
   * range: 'daily' | 'monthly' | 'yearly'
   * optional start/end filter as ISO date strings (YYYY-MM-DD)
   */
  async getShopkeeperSalesOverview(shopkeeperUserId: string, range = 'daily', start?: string, end?: string) {
    const shopkeeper = await this.shopkeeperModel.findOne({ userId: new Types.ObjectId(shopkeeperUserId) });
    if (!shopkeeper) throw new NotFoundException('Shopkeeper not found');

    const match: any = { shopkeeperId: shopkeeper._id };
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) {
        // include entire end day
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);
        match.createdAt.$lte = endDate;
      }
    }

    let dateFormat = '%Y-%m-%d';
    if (range === 'monthly') dateFormat = '%Y-%m';
    else if (range === 'yearly') dateFormat = '%Y';

    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          totalSales: { $sum: '$amount' },
          totalCommission: { $sum: '$commissionAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const rows = await this.purchaseModel.aggregate(pipeline);
    return rows.map((r: any) => ({ period: r._id, totalSales: r.totalSales || 0, totalCommission: r.totalCommission || 0, count: r.count || 0 }));
  }

  async getMyShop(userId: string) {
    return this.shopkeeperModel.findOne({ userId: new Types.ObjectId(userId) });
  }

  async getAllShopkeepers() {
    const shopkeepers = await this.shopkeeperModel
      .find()
      .populate('userId', 'name email phone referralCode totalReferralEarnings')
      .sort({ createdAt: -1 });

    const rows = await Promise.all(
      shopkeepers.map(async (shopkeeper: any) => {
        const userId = shopkeeper.userId?._id;
        const referralCount = userId ? await this.usersService.countReferrals(userId.toString()) : 0;
        return {
          ...shopkeeper.toObject(),
          referralCount,
        };
      }),
    );

    return rows;
  }

  async deleteShopkeeper(shopkeeperId: string) {
    const shopkeeper = await this.shopkeeperModel.findById(shopkeeperId);
    if (!shopkeeper) throw new NotFoundException('Shopkeeper not found');

    const userId = shopkeeper.userId.toString();
    await this.shopkeeperModel.findByIdAndDelete(shopkeeperId);
    await this.usersService.updateRole(userId, 'user');
    await this.usersService.updateProfile(userId, { shopkeeperStatus: 'none' } as any);

    return { message: 'Shopkeeper deleted successfully' };
  }

  async getShopkeeperStats() {
    const total = await this.shopkeeperModel.countDocuments();
    const active = await this.shopkeeperModel.countDocuments({ status: 'active' });
    const totalSales = await this.shopkeeperModel.aggregate([
      { $group: { _id: null, total: { $sum: '$totalSales' } } },
    ]);
    const totalCommission = await this.shopkeeperModel.aggregate([
      { $group: { _id: null, total: { $sum: '$totalCommissionPaid' } } },
    ]);

    return {
      totalShopkeepers: total,
      activeShopkeepers: active,
      totalSales: totalSales[0]?.total || 0,
      totalCommission: totalCommission[0]?.total || 0,
    };
  }

  // ========== PURCHASE / SHOPPING ==========

  async recordPurchase(shopkeeperUserId: string, dto: RecordPurchaseDto) {
    // Resolve shopkeeper: prefer provided shopkeeperId, otherwise use logged-in user's shop
    let shopkeeper: Shopkeeper | null = null;
    if (dto.shopkeeperId) {
      shopkeeper = await this.shopkeeperModel.findById(dto.shopkeeperId);
    } else {
      shopkeeper = await this.shopkeeperModel.findOne({ userId: new Types.ObjectId(shopkeeperUserId) });
    }

    if (!shopkeeper) {
      throw new NotFoundException('Shopkeeper not found');
    }

    if (shopkeeper.status !== 'active') {
      throw new BadRequestException('Your shopkeeper account is pending admin approval. You cannot record sales yet.');
    }

    if (shopkeeper.userId.toString() !== shopkeeperUserId) {
      throw new BadRequestException('You can only record purchases for your own shop');
    }

    // Find the customer cycle by coupon
    const cycle = await this.cycleModel.findOne({ couponNumber: dto.customerCoupon, status: { $in: ['active', 'completed'] } });
    if (!cycle) {
      throw new NotFoundException('Customer coupon not found or not active');
    }

    const commissionAmount = Math.round(dto.amount * this.COMMISSION_RATE * 100) / 100;

    // Check shopkeeper's wallet for commission
    const shopkeeperBalance = await this.walletService.getBalance(shopkeeperUserId);
    if (shopkeeperBalance < commissionAmount) {
      throw new BadRequestException(`Insufficient wallet balance to pay commission of PKR ${commissionAmount}`);
    }

    // Debit commission from shopkeeper wallet (goes to admin/system)
    await this.walletService.debit(shopkeeperUserId, commissionAmount);

    // Record the purchase
    const purchase = new this.purchaseModel({
      customerId: cycle.customerId,
      shopkeeperId: shopkeeper._id,
      amount: dto.amount,
      commissionAmount,
      customerCoupon: dto.customerCoupon,
      description: dto.description,
      status: 'completed',
    });
    await purchase.save();

    // Update shopkeeper stats
    shopkeeper.totalSales += dto.amount;
    shopkeeper.totalCommissionPaid += commissionAmount;
    await shopkeeper.save();

    // Add the full shopping amount to customer's cashback cycle
    cycle.totalShopping += dto.amount;
    const { level, committed, remaining } = this.calculateLevel(cycle.totalShopping);
    cycle.currentLevel = level;
    cycle.totalCommitted = committed;
    cycle.remaining = remaining;

    // Check if completed all 30 levels
    if (level >= this.MAX_LEVELS && !cycle.isPermanent) {
      cycle.isPermanent = true;
      cycle.status = 'completed';

      await this.createNotification(
        cycle.customerId.toString(),
        '🎊 30-Level Cycle Complete!',
        `Your coupon ${cycle.couponNumber} is now permanently in the draw! You've been assigned a new coupon.`,
        'SYSTEM',
      );

      // Create a new cycle for the customer
      await this.createNewCycle(cycle.customerId.toString());
    }

    await cycle.save();

    // Notify customer about the purchase
    await this.createNotification(
      cycle.customerId.toString(),
      'Shopping Added!',
      `PKR ${dto.amount} shopping recorded from ${shopkeeper.shopName}. Your level: ${cycle.currentLevel}/${this.MAX_LEVELS}`,
      'SHOPPING',
    );

    return {
      message: 'Purchase recorded successfully',
      purchase,
      customerLevel: cycle.currentLevel,
      customerTotalShopping: cycle.totalShopping,
      customerRemaining: cycle.remaining,
      commissionPaid: commissionAmount,
    };
  }

  // ========== CUSTOMER CYCLE ==========

  async joinCashback(userId: string) {
    const existing = await this.cycleModel.findOne({ customerId: new Types.ObjectId(userId), status: 'active' });
    if (existing) {
      throw new BadRequestException('You already have an active cashback cycle');
    }

    return this.createNewCycle(userId);
  }

  private async createNewCycle(userId: string) {
    const coupon = this.generateCoupon();
    const cycle = new this.cycleModel({
      customerId: new Types.ObjectId(userId),
      couponNumber: coupon,
      totalShopping: 0,
      currentLevel: 0,
      totalCommitted: 0,
      remaining: 0,
      status: 'active',
      cycleStartDate: new Date(),
    });
    await cycle.save();

    await this.createNotification(
      userId,
      'Cashback Cycle Started!',
      `Your cashback coupon is: ${coupon}. Show this to shopkeepers when making purchases.`,
      'SYSTEM',
    );

    return { message: 'Cashback cycle started', coupon, cycleId: cycle._id };
  }

  async getMyActiveCycle(userId: string) {
    const cycle = await this.cycleModel.findOne({
      customerId: new Types.ObjectId(userId),
      status: 'active',
    });
    if (!cycle) {
      return { hasCycle: false, cycle: null };
    }

    return {
      hasCycle: true,
      cycle: {
        id: cycle._id,
        couponNumber: cycle.couponNumber,
        totalShopping: cycle.totalShopping,
        currentLevel: cycle.currentLevel,
        totalCommitted: cycle.totalCommitted,
        remaining: cycle.remaining,
        status: cycle.status,
        isPermanent: cycle.isPermanent,
        cycleStartDate: cycle.cycleStartDate,
        levelsRemaining: this.MAX_LEVELS - cycle.currentLevel,
        nextLevelCost: cycle.currentLevel < this.MAX_LEVELS ? (cycle.currentLevel + 1) * this.LEVEL_BASE : 0,
        shoppingNeededForNextLevel: cycle.currentLevel < this.MAX_LEVELS
          ? Math.max(0, (cycle.currentLevel + 1) * this.LEVEL_BASE - cycle.remaining)
          : 0,
      },
    };
  }

  async getAllMyCycles(userId: string) {
    return this.cycleModel.find({ customerId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
  }

  async getCommitmentTable(userId: string) {
    const cycle = await this.cycleModel.findOne({
      customerId: new Types.ObjectId(userId),
      status: { $in: ['active', 'completed'] },
    }).sort({ createdAt: -1 });

    if (!cycle) {
      return { hasCycle: false, table: [] };
    }

    const table: any[] = [];
    let cumulativeCost = 0;
    for (let day = 1; day <= this.MAX_LEVELS; day++) {
      const dayCost = day * this.LEVEL_BASE;
      cumulativeCost += dayCost;
      const isUnlocked = day <= cycle.currentLevel;
      const remainingAtLevel = isUnlocked ? 0 : Math.max(0, cumulativeCost - cycle.totalShopping);

      table.push({
        day,
        commitment: dayCost,
        cumulativeCommitment: cumulativeCost,
        isUnlocked,
        inDraw: isUnlocked,
        remaining: isUnlocked ? 0 : remainingAtLevel,
      });
    }

    return {
      hasCycle: true,
      couponNumber: cycle.couponNumber,
      currentLevel: cycle.currentLevel,
      totalShopping: cycle.totalShopping,
      remaining: cycle.remaining,
      isPermanent: cycle.isPermanent,
      table,
    };
  }

  // ========== PURCHASES HISTORY ==========

  async getAllCustomerCycles(limit = 200) {
    return this.cycleModel
      .find()
      .populate('customerId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async getMyPurchases(userId: string, limit = 50) {
    return this.purchaseModel
      .find({ customerId: new Types.ObjectId(userId) })
      .populate('shopkeeperId', 'shopName ownerName')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async getShopPurchases(shopkeeperId: string, limit = 50) {
    return this.purchaseModel
      .find({ shopkeeperId: new Types.ObjectId(shopkeeperId) })
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async getAllPurchases(limit = 100) {
    return this.purchaseModel
      .find()
      .populate('customerId', 'name phone')
      .populate('shopkeeperId', 'shopName ownerName')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  // ========== LUCKY DRAW ==========

  async executeLuckyDraw() {
    // Get all eligible coupons (active cycles at level >= 1 + permanent completed cycles)
    const eligibleCycles = await this.cycleModel.find({
      $or: [
        { status: 'active', currentLevel: { $gte: 1 } },
        { status: 'completed', isPermanent: true },
      ],
    });

    if (eligibleCycles.length === 0) {
      return { message: 'No participants for the draw', draw: null };
    }

    const winningNumber = this.generateWinningNumber();
    const winner = eligibleCycles.find((c) => c.couponNumber === winningNumber);

    const lastDraw = await this.drawModel.findOne().sort({ drawNumber: -1 });
    const drawNumber = lastDraw ? lastDraw.drawNumber + 1 : 1;

    let prizeAmount = 0;
    let winnerUserId: string | undefined;
    let winnerCoupon: string | undefined;

    if (winner) {
      // Prize = the customer's total shopping amount in their cashback wallet
      prizeAmount = winner.totalShopping;
      winnerUserId = winner.customerId.toString();
      winnerCoupon = winner.couponNumber;

      // Credit the prize to the winner's main wallet
      await this.walletService.credit(winnerUserId, prizeAmount);

      // Reset the cycle - customer starts from 0
      winner.status = 'won';
      winner.wonDate = new Date();
      winner.wonAmount = prizeAmount;
      await winner.save();

      // Notify winner
      await this.createNotification(
        winnerUserId,
        '🎉 YOU WON!',
        `Congratulations! Your coupon ${winner.couponNumber} won PKR ${prizeAmount} in Cashback Draw #${drawNumber}!`,
        'WIN',
      );

      // Only notify other participants when someone wins
      for (const cycle of eligibleCycles) {
        if (cycle.customerId.toString() !== winnerUserId) {
          await this.createNotification(
            cycle.customerId.toString(),
            `Draw #${drawNumber} Result`,
            `Winning number: ${winningNumber}. A winner was found! Keep shopping to increase your chances.`,
            'DRAW',
          );
        }
      }
    }

    const draw = new this.drawModel({
      drawNumber,
      winningNumber,
      winnerUserId,
      winnerCoupon,
      prizeAmount,
      totalParticipants: eligibleCycles.length,
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
        prizeAmount,
        totalParticipants: eligibleCycles.length,
        drawDate: draw.drawDate,
      },
    };
  }

  async getDrawHistory(limit = 20) {
    return this.drawModel.find().sort({ drawDate: -1 }).limit(limit);
  }

  async getNextDrawInfo() {
    const lastDraw = await this.drawModel.findOne().sort({ drawDate: -1 });
    const totalParticipants = await this.cycleModel.countDocuments({
      $or: [
        { status: 'active', currentLevel: { $gte: 1 } },
        { status: 'completed', isPermanent: true },
      ],
    });

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
            hasWinner: !!lastDraw.winnerUserId,
            winnerCoupon: lastDraw.winnerCoupon,
            prizeAmount: lastDraw.prizeAmount,
            drawDate: lastDraw.drawDate,
          }
        : null,
    };
  }

  async getWinningHistory(userId: string) {
    const draws = await this.drawModel.find({ winnerUserId: userId }).sort({ drawDate: -1 });
    const totalWon = draws.reduce((sum, d) => sum + d.prizeAmount, 0);
    return { wins: draws, totalWon, totalWins: draws.length };
  }

  // ========== DASHBOARD STATS ==========

  async getDashboardStats(userId: string) {
    const activeCycle = await this.cycleModel.findOne({ customerId: new Types.ObjectId(userId), status: 'active' });
    const allCycles = await this.cycleModel.find({ customerId: new Types.ObjectId(userId) });
    const purchases = await this.purchaseModel.countDocuments({ customerId: new Types.ObjectId(userId) });
    const wins = await this.drawModel.find({ winnerUserId: userId });
    const totalWinnings = wins.reduce((sum, d) => sum + d.prizeAmount, 0);
    const walletBalance = await this.walletService.getBalance(userId);
    const totalParticipants = await this.cycleModel.countDocuments({
      $or: [
        { status: 'active', currentLevel: { $gte: 1 } },
        { status: 'completed', isPermanent: true },
      ],
    });

    return {
      walletBalance,
      totalShopping: activeCycle ? activeCycle.totalShopping : 0,
      currentLevel: activeCycle ? activeCycle.currentLevel : 0,
      remaining: activeCycle ? activeCycle.remaining : 0,
      totalWinnings,
      totalCycles: allCycles.length,
      totalPurchases: purchases,
      totalWins: wins.length,
      totalParticipants,
      activeCycle: activeCycle
        ? {
            couponNumber: activeCycle.couponNumber,
            currentLevel: activeCycle.currentLevel,
            totalShopping: activeCycle.totalShopping,
            remaining: activeCycle.remaining,
            levelsLeft: this.MAX_LEVELS - activeCycle.currentLevel,
            isPermanent: activeCycle.isPermanent,
          }
        : null,
      permanentCoupons: allCycles
        .filter((c) => c.isPermanent)
        .map((c) => ({
          couponNumber: c.couponNumber,
          totalShopping: c.totalShopping,
        })),
    };
  }

  async getAdminStats() {
    const totalShopkeepers = await this.shopkeeperModel.countDocuments();
    const totalCustomers = await this.cycleModel.distinct('customerId');
    const totalPurchases = await this.purchaseModel.countDocuments();
    const totalCommission = await this.purchaseModel.aggregate([
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } },
    ]);
    const totalSalesAgg = await this.purchaseModel.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalDraws = await this.drawModel.countDocuments();
    const drawsWithWinners = await this.drawModel.countDocuments({ winnerUserId: { $exists: true, $ne: null } });

    return {
      totalShopkeepers,
      totalCustomers: totalCustomers.length,
      totalPurchases,
      totalCommission: totalCommission[0]?.total || 0,
      totalSales: totalSalesAgg[0]?.total || 0,
      totalDraws,
      drawsWithWinners,
      commissionRate: this.COMMISSION_RATE * 100 + '%',
    };
  }

  // ========== NOTIFICATIONS ==========

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

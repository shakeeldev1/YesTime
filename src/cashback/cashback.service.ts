import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Shopkeeper } from './schemas/shopkeeper.schema';
import { CashbackPurchase } from './schemas/cashback-purchase.schema';
import { CashbackCycle } from './schemas/cashback-cycle.schema';
import { CashbackDraw } from './schemas/cashback-draw.schema';
import { CashbackParticipation } from './schemas/cashback-participation.schema';
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
  // Total shopping a single cycle/coupon can ever hold: sum(1..30) * 1000 = 465,000.
  private readonly MAX_CYCLE_TOTAL = ((this.MAX_LEVELS * (this.MAX_LEVELS + 1)) / 2) * this.LEVEL_BASE;

  constructor(
    @InjectModel(Shopkeeper.name) private readonly shopkeeperModel: Model<Shopkeeper>,
    @InjectModel(CashbackPurchase.name) private readonly purchaseModel: Model<CashbackPurchase>,
    @InjectModel(CashbackCycle.name) private readonly cycleModel: Model<CashbackCycle>,
    @InjectModel(CashbackDraw.name) private readonly drawModel: Model<CashbackDraw>,
    @InjectModel(CashbackParticipation.name) private readonly participationModel: Model<CashbackParticipation>,
    @InjectModel(CashbackNotification.name) private readonly notificationModel: Model<CashbackNotification>,
    private readonly walletService: WalletService,
    private readonly usersService: UsersService,
    private readonly mailerService: MailerService,
  ) {}

  // ========== HELPERS ==========

  private generateCoupon(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // CashbackCycle.couponNumber has a unique DB index, so collisions must be retried
  // (mirrors the same pattern already used by registration-lottery and car-participation).
  private async generateUniqueCycleCoupon(): Promise<string> {
    let coupon = this.generateCoupon();
    while (await this.cycleModel.findOne({ couponNumber: coupon })) {
      coupon = this.generateCoupon();
    }
    return coupon;
  }

  private generateWinningNumber(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // The shared draw-scheduler rotates 4 modules every minute (registration -> car ->
  // game -> cashback), so THIS module only actually draws once every 4 minutes, on
  // whichever future minute boundary lands on rotation slot 3. Must stay in sync with
  // the rotation order in draw-scheduler.service.ts.
  private readonly ROTATION_SLOT = 3;
  private readonly ROTATION_SIZE = 4;

  private computeNextDrawTime(now: Date): Date {
    const currentMinuteIndex = Math.floor(now.getTime() / 60000);
    const currentSlot = currentMinuteIndex % this.ROTATION_SIZE;
    let minutesUntil = (this.ROTATION_SLOT - currentSlot + this.ROTATION_SIZE) % this.ROTATION_SIZE;
    if (minutesUntil === 0) minutesUntil = this.ROTATION_SIZE;
    return new Date((currentMinuteIndex + minutesUntil) * 60000);
  }

  private getUtcDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private getNextUtcMidnight(date: Date): Date {
    const next = new Date(date);
    next.setUTCHours(24, 0, 0, 0);
    return next;
  }

  private isSameUtcDay(firstDate: Date, secondDate: Date): boolean {
    return this.getUtcDateKey(firstDate) === this.getUtcDateKey(secondDate);
  }

  /**
   * All of a customer's coupons that are currently allowed to enter the daily draw:
   * the active cycle (once it has committed at least level 1), plus every past cycle
   * that became permanent (level 30) or already won - those keep playing forever.
   * Sorted oldest-first so permanent coupons get an entry before the newest active one.
   */
  private async getEligibleCyclesForUser(userId: string) {
    return this.cycleModel
      .find({
        customerId: new Types.ObjectId(userId),
        $or: [
          { status: 'active', currentLevel: { $gte: 1 } },
          { status: 'completed', isPermanent: true },
          { status: 'won' },
        ],
      })
      .sort({ createdAt: 1 });
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

  // DEPRECATED: No longer used - payment method not implemented yet
  // Will be re-enabled when payment gateway is added
  // private async ensureRegistrationFeeBalance(userId: string) {
  //   const balance = await this.walletService.getBalance(userId);
  //   if (balance < this.REGISTRATION_FEE) {
  //     throw new BadRequestException(
  //       `Insufficient wallet balance. You need PKR ${this.REGISTRATION_FEE} to submit shopkeeper request. Current balance: PKR ${balance}`,
  //     );
  //   }
  // }

  // ========== SHOPKEEPER MANAGEMENT ==========

  /** User submits request to become shopkeeper (pending admin approval) - CHARGES FEE UPFRONT */
  async requestShopkeeper(userId: string, dto: RegisterShopkeeperDto) {
    const existing = await this.shopkeeperModel.findOne({ userId: new Types.ObjectId(userId) });
    if (existing) {
      // Allow reapplication only if previous was rejected
      if (existing.status !== 'rejected') {
        const statusString = existing.status === 'active' ? 'already approved' : 'already ' + existing.status;
        throw new BadRequestException(
          `You have a shopkeeper request that is ${statusString}. Status: ${existing.status}. Please contact admin to modify.`,
        );
      }
      
      // Reapply after rejection: No balance check needed (payment method not implemented yet)
      existing.shopName = dto.shopName;
      existing.ownerName = dto.ownerName;
      existing.phone = dto.phone;
      existing.address = dto.address;
      existing.shopType = dto.shopType;
      existing.shopDescription = dto.shopDescription;
      existing.status = 'pending';
      existing.isRegistrationPaid = false; // Fee NOT charged - payment method pending
      await existing.save();
      
      // Update user's shopkeeper status to pending
      await this.usersService.updateProfile(userId, { shopkeeperStatus: 'pending' } as any);
      
      await this.createNotification(
        userId,
        'Request Re-submitted',
        `Your shopkeeper request for \"${dto.shopName}\" has been re-submitted. Waiting for admin review.`,
        'SYSTEM',
      );
      
      return { message: 'Shopkeeper request re-submitted. Waiting for admin review.', shopkeeper: existing };
    }

    // No balance check needed (payment method not implemented yet)
    const shopkeeper = new this.shopkeeperModel({
      userId: new Types.ObjectId(userId),
      shopName: dto.shopName,
      ownerName: dto.ownerName,
      phone: dto.phone,
      address: dto.address,
      shopType: dto.shopType,
      shopDescription: dto.shopDescription,
      status: 'pending',
      isRegistrationPaid: false, // Fee NOT charged - payment method pending
      couponNumber: this.generateCoupon(),
    });
    await shopkeeper.save();

    // Update user's shopkeeper status to pending
    await this.usersService.updateProfile(userId, { shopkeeperStatus: 'pending' } as any);

    await this.createNotification(
      userId,
      'Request Submitted',
      `Your shopkeeper request for \"${dto.shopName}\" has been submitted. Waiting for admin review.`,
      'SYSTEM',
    );

    return { message: 'Shopkeeper request submitted. Waiting for admin review.', shopkeeper };
  }

  /** 
   * ADMIN ONLY: Direct register shopkeeper (for admin migrations/imports)
   * This is deprecated - use the approval workflow instead
   */
  async registerShopkeeperAdmin(adminId: string, userId: string, dto: RegisterShopkeeperDto) {
    // Note: adminId verification should be done at controller level via RolesGuard
    const existing = await this.shopkeeperModel.findOne({ userId: new Types.ObjectId(userId) });
    if (existing) {
      throw new BadRequestException('Shopkeeper already exists. Status: ' + existing.status);
    }

    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');

    const balance = await this.walletService.getBalance(userId);
    if (balance < this.REGISTRATION_FEE) {
      throw new BadRequestException(`Insufficient wallet balance. Registration fee is PKR ${this.REGISTRATION_FEE}`);
    }

    // Charge fee for admin-registered shopkeeper
    await this.walletService.debit(userId, this.REGISTRATION_FEE);

    const shopkeeper = new this.shopkeeperModel({
      userId: new Types.ObjectId(userId),
      shopName: dto.shopName,
      ownerName: dto.ownerName,
      phone: dto.phone,
      address: dto.address,
      shopType: dto.shopType,
      shopDescription: dto.shopDescription,
      isRegistrationPaid: true,
      status: 'active',
      couponNumber: this.generateCoupon(),
    });
    await shopkeeper.save();

    // Update user role and status
    await this.usersService.updateRole(userId, 'shopkeeper');
    await this.usersService.updateProfile(userId, { shopkeeperStatus: 'approved' } as any);

    await this.createNotification(
      userId,
      'Shop Registered by Admin',
      `Your shop "${dto.shopName}" has been registered. PKR ${this.REGISTRATION_FEE} registration fee deducted.`,
      'SYSTEM',
    );

    return { message: 'Shopkeeper registered successfully by admin', shopkeeper };
  }

  /** 
   * DEPRECATED: Use requestShopkeeper + approveShopkeeper workflow instead
   * This method is kept for backwards compatibility but should not be exposed in API
   */
  async registerShopkeeper(userId: string, dto: RegisterShopkeeperDto) {
    throw new BadRequestException('This endpoint has been deprecated. Use /cashback/shopkeeper/request instead.');
  }

  /** Admin approves pending shopkeeper request - Fee should already be paid by user */
  async approveShopkeeper(shopkeeperId: string) {
    const shopkeeper = await this.shopkeeperModel.findById(shopkeeperId);
    if (!shopkeeper) throw new NotFoundException('Shopkeeper not found');
    if (shopkeeper.status !== 'pending') {
      throw new BadRequestException('Shopkeeper is not in pending status');
    }

    const userId = shopkeeper.userId.toString();

    // Fee already paid at request time, so just activate
    shopkeeper.status = 'active';
    await shopkeeper.save();

    // Ensure user role is set to shopkeeper upon approval
    await this.usersService.updateRole(userId, 'shopkeeper');
    await this.usersService.updateProfile(userId, { shopkeeperStatus: 'approved' } as any);

    await this.createNotification(
      userId,
      '🎉 Request Approved!',
      `Your shopkeeper request has been approved! You can now start selling. Your registration fee has been locked in.`,
      'SYSTEM',
    );

    // Send email notification
    const user = await this.usersService.findById(userId);
    if (user) {
      await this.mailerService.sendShopkeeperApprovalEmail(user.email, user.name, shopkeeper.shopName);
    }

    return { message: 'Shopkeeper approved successfully. You can now record purchases.', shopkeeper };
  }

  /** Admin rejects pending shopkeeper request */
  async rejectShopkeeper(shopkeeperId: string, reason?: string) {
    const shopkeeper = await this.shopkeeperModel.findById(shopkeeperId);
    if (!shopkeeper) throw new NotFoundException('Shopkeeper not found');
    if (shopkeeper.status !== 'pending') {
      throw new BadRequestException('Shopkeeper is not in pending status');
    }

    const userId = shopkeeper.userId.toString();

    // Refund the registration fee since request is rejected
    if (shopkeeper.isRegistrationPaid) {
      await this.walletService.credit(userId, this.REGISTRATION_FEE);
    }

    shopkeeper.status = 'rejected';
    await shopkeeper.save();

    await this.createNotification(
      userId,
      'Request Rejected',
      `${reason || 'Your shopkeeper request has been rejected by admin.'} Your registration fee PKR ${this.REGISTRATION_FEE} has been refunded to your wallet.`,
      'SYSTEM',
    );

    // Send email notification
    const user = await this.usersService.findById(userId);
    if (user) {
      await this.mailerService.sendShopkeeperRejectionEmail(user.email, user.name, shopkeeper.shopName, reason);
      await this.usersService.updateProfile(userId, { shopkeeperStatus: 'rejected' } as any);
    }

    return { message: 'Shopkeeper request rejected. Fee PKR ' + this.REGISTRATION_FEE + ' has been refunded.', shopkeeper };
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

  /**
   * PUBLIC: List active shops for the "find shops near me" directory.
   * Only exposes business-facing fields (no userId/email/coupon/sales figures).
   * Optional `search` matches shop name, address/area, or shop type/category.
   */
  async getPublicShopkeepers(search?: string) {
    const filter: any = { status: 'active' };
    if (search && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = { $regex: escaped, $options: 'i' };
      filter.$or = [{ shopName: regex }, { address: regex }, { shopType: regex }];
    }

    const shopkeepers = await this.shopkeeperModel
      .find(filter)
      .select('shopName ownerName phone address shopType shopDescription createdAt')
      .sort({ shopName: 1 });

    return shopkeepers.map((shopkeeper: any) => ({
      id: shopkeeper._id,
      shopName: shopkeeper.shopName,
      ownerName: shopkeeper.ownerName,
      phone: shopkeeper.phone,
      address: shopkeeper.address || null,
      shopType: shopkeeper.shopType || null,
      shopDescription: shopkeeper.shopDescription || null,
      createdAt: shopkeeper.createdAt,
    }));
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

  async recordPurchase(shopkeeperUserId: string, dto: RecordPurchaseDto, userRole: string = 'user') {
    // Verify caller is a shopkeeper
    if (userRole !== 'shopkeeper') {
      throw new BadRequestException('Only shopkeepers can record purchases. Your role is: ' + userRole);
    }

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
      throw new BadRequestException(
        `Your shopkeeper account is in ${shopkeeper.status} status. You cannot record sales until approved by admin.`,
      );
    }

    // Ensure the shopkeeper belongs to the logged-in user (unless admin is using shopkeeperId param)
    if (!dto.shopkeeperId && shopkeeper.userId.toString() !== shopkeeperUserId) {
      throw new BadRequestException('Mismatched shopkeeper. You can only record purchases for your own shop.');
    }

    // Find the customer cycle by coupon
    // Include 'active', 'completed', and 'won' cycles to allow purchases for won customers
    const cycle = await this.cycleModel.findOne({ couponNumber: dto.customerCoupon, status: { $in: ['active', 'completed', 'won'] } });
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

    // Add the shopping amount to the customer's cycle, capping it at 465,000 (level 30) and
    // rolling any overflow into their next coupon automatically.
    const applied = await this.applyShoppingAmount(cycle.customerId.toString(), cycle, dto.amount);
    const finalEntry = applied[applied.length - 1];
    const finalCycle = finalEntry.cycle;
    const splitAcrossCoupons = applied.length > 1;

    // Notify customer about the purchase
    await this.createNotification(
      cycle.customerId.toString(),
      'Shopping Added!',
      splitAcrossCoupons
        ? `PKR ${dto.amount} shopping recorded from ${shopkeeper.shopName}, split across ${applied.length} coupons since coupon ${cycle.couponNumber} reached its maximum level.`
        : `PKR ${dto.amount} shopping recorded from ${shopkeeper.shopName}. Your level: ${finalCycle.currentLevel}/${this.MAX_LEVELS}`,
      'SHOPPING',
    );

    return {
      message: 'Purchase recorded successfully',
      purchase,
      customerLevel: finalCycle.currentLevel,
      customerTotalShopping: finalCycle.totalShopping,
      customerRemaining: finalCycle.remaining,
      commissionPaid: commissionAmount,
      ...(splitAcrossCoupons
        ? {
            splitAcrossCoupons: applied.map((entry) => ({
              couponNumber: entry.cycle.couponNumber,
              appliedAmount: entry.appliedAmount,
              isPermanent: entry.cycle.isPermanent,
            })),
          }
        : {}),
    };
  }

  // ========== CUSTOMER CYCLE ==========

  async joinCashback(userId: string) {
    const existingActive = await this.cycleModel.findOne({ customerId: new Types.ObjectId(userId), status: 'active' });
    if (existingActive) {
      throw new BadRequestException(
        'You already have an active cashback cycle with coupon: ' + existingActive.couponNumber,
      );
    }

    // If customer won before, they may have a 'won' cycle. Still allow them to join a new active cycle.
    // The old won cycle will remain in the draw pool.
    return this.createNewCycle(userId);
  }

  /**
   * PUBLIC (auth): Status of every eligible coupon for today - which ones already played
   * and how many plays are still available. Drives the "Play (N left)" button + coupon list.
   */
  async getPlayStatus(userId: string) {
    const eligibleCycles = await this.getEligibleCyclesForUser(userId);
    const now = new Date();
    const playDateKey = this.getUtcDateKey(now);

    const playedToday = await this.participationModel.find({
      customerId: new Types.ObjectId(userId),
      playDateKey,
    });
    const playedCouponNumbers = new Set(playedToday.map((entry) => entry.couponNumber));

    const coupons = eligibleCycles.map((cycle) => ({
      couponNumber: cycle.couponNumber,
      status: cycle.status,
      isPermanent: cycle.isPermanent,
      currentLevel: cycle.currentLevel,
      totalShopping: cycle.totalShopping,
      playedToday: playedCouponNumbers.has(cycle.couponNumber),
    }));

    const playsAvailableToday = coupons.length;
    const playsUsedToday = coupons.filter((c) => c.playedToday).length;
    const playsRemainingToday = playsAvailableToday - playsUsedToday;

    return {
      hasEligibleCoupon: playsAvailableToday > 0,
      canPlayToday: playsRemainingToday > 0,
      playsAvailableToday,
      playsUsedToday,
      playsRemainingToday,
      coupons,
      nextEligiblePlayAt: playsRemainingToday > 0 ? null : this.getNextUtcMidnight(now),
    };
  }

  /**
   * Spends exactly ONE play per call - enters the next not-yet-played-today eligible coupon
   * (oldest/permanent coupons first) into the draw. Call repeatedly to play all of today's
   * eligible coupons, mirroring the car-participation "play-now" pattern.
   */
  async playForToday(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const eligibleCycles = await this.getEligibleCyclesForUser(userId);
    if (eligibleCycles.length === 0) {
      throw new BadRequestException('You do not have an eligible cashback coupon to play today.');
    }

    const now = new Date();
    const playDateKey = this.getUtcDateKey(now);
    const playedToday = await this.participationModel.find({
      customerId: new Types.ObjectId(userId),
      playDateKey,
    });
    const playedCouponNumbers = new Set(playedToday.map((entry) => entry.couponNumber));

    const nextCycle = eligibleCycles.find((cycle) => !playedCouponNumbers.has(cycle.couponNumber));
    if (!nextCycle) {
      throw new BadRequestException('You have already played all your eligible coupons today. Please come back tomorrow.');
    }

    try {
      const participation = new this.participationModel({
        customerId: new Types.ObjectId(userId),
        playDateKey,
        couponNumber: nextCycle.couponNumber,
        status: 'pending',
        enteredAt: now,
      });
      await participation.save();

      await this.createNotification(
        userId,
        'Play confirmed',
        `Your coupon ${nextCycle.couponNumber} is entered into the next cashback draw.`,
        'DRAW',
      );

      const playsAvailableToday = eligibleCycles.length;
      const playsUsedToday = playedCouponNumbers.size + 1;
      const playsRemainingToday = playsAvailableToday - playsUsedToday;

      return {
        message: `Coupon ${nextCycle.couponNumber} entered into the next cashback draw.`,
        canPlayToday: playsRemainingToday > 0,
        enteredIntoNextDraw: true,
        playDateKey,
        couponNumber: nextCycle.couponNumber,
        playsAvailableToday,
        playsUsedToday,
        playsRemainingToday,
        nextEligiblePlayAt: playsRemainingToday > 0 ? null : this.getNextUtcMidnight(now),
      };
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new BadRequestException('This coupon has already played today.');
      }
      throw error;
    }
  }

  private async createCycleDocument(userId: string) {
    const cycle = new this.cycleModel({
      customerId: new Types.ObjectId(userId),
      couponNumber: await this.generateUniqueCycleCoupon(),
      totalShopping: 0,
      currentLevel: 0,
      totalCommitted: 0,
      remaining: 0,
      status: 'active',
      cycleStartDate: new Date(),
    });
    await cycle.save();
    return cycle;
  }

  private async createNewCycle(userId: string) {
    const cycle = await this.createCycleDocument(userId);

    await this.createNotification(
      userId,
      'Cashback Cycle Started!',
      `Your cashback coupon is: ${cycle.couponNumber}. Show this to shopkeepers when making purchases.`,
      'SYSTEM',
    );

    return { message: 'Cashback cycle started', coupon: cycle.couponNumber, cycleId: cycle._id };
  }

  /**
   * Applies a shopping amount to a customer's cycle, capping each cycle at MAX_CYCLE_TOTAL
   * (465,000 / level 30). Any amount beyond that cap automatically rolls into the customer's
   * next coupon (reusing their current active cycle, or auto-creating a new one), cascading
   * further in the rare case a single purchase overflows more than one cycle.
   */
  private async applyShoppingAmount(userId: string, startingCycle: CashbackCycle, amount: number) {
    const applied: Array<{ cycle: CashbackCycle; appliedAmount: number }> = [];
    let cycle = startingCycle;
    let remainingAmount = amount;

    while (remainingAmount > 0) {
      const capacity = Math.max(0, this.MAX_CYCLE_TOTAL - cycle.totalShopping);
      const amountForThisCycle = Math.min(capacity, remainingAmount);

      cycle.totalShopping += amountForThisCycle;
      const { level, committed, remaining } = this.calculateLevel(cycle.totalShopping);
      cycle.currentLevel = level;
      cycle.totalCommitted = committed;
      cycle.remaining = remaining;

      if (level >= this.MAX_LEVELS && !cycle.isPermanent) {
        cycle.isPermanent = true;
        cycle.status = 'completed';

        await this.createNotification(
          userId,
          '🎊 30-Level Cycle Complete!',
          `Your coupon ${cycle.couponNumber} is now permanently in the draw! Keep shopping - you could win anytime!`,
          'SYSTEM',
        );
      }

      await cycle.save();
      applied.push({ cycle, appliedAmount: amountForThisCycle });
      remainingAmount -= amountForThisCycle;

      if (remainingAmount > 0) {
        let nextCycle = await this.cycleModel.findOne({ customerId: new Types.ObjectId(userId), status: 'active' });
        if (!nextCycle) {
          nextCycle = await this.createCycleDocument(userId);
          await this.createNotification(
            userId,
            'New Cashback Coupon Assigned',
            `Your previous coupon reached the maximum level. Your remaining PKR ${remainingAmount} shopping was moved to new coupon ${nextCycle.couponNumber}.`,
            'SYSTEM',
          );
        }
        cycle = nextCycle;
      }
    }

    return applied;
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
      .populate('customerId', 'name email phone')
      .populate('shopkeeperId', 'shopName ownerName')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * ADMIN: Deletes a single purchase/shopping record. This is a pure history cleanup -
   * it does NOT reverse the shopping amount already applied to the customer's cycle level
   * or refund the commission already debited from the shopkeeper's wallet.
   */
  async deletePurchase(purchaseId: string) {
    const purchase = await this.purchaseModel.findByIdAndDelete(purchaseId);
    if (!purchase) throw new NotFoundException('Purchase not found');
    return { message: 'Purchase deleted successfully' };
  }

  /** ADMIN: Bulk-deletes purchase records by id (checkbox multi-select on the admin table). */
  async deletePurchasesByIds(ids: string[]) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('No purchase ids provided');
    }
    const result = await this.purchaseModel.deleteMany({ _id: { $in: ids } });
    return { message: `${result.deletedCount} purchase(s) deleted successfully`, deletedCount: result.deletedCount };
  }

  /** ADMIN: Deletes every purchase/shopping record belonging to one customer. */
  async deletePurchasesByCustomer(customerId: string) {
    const result = await this.purchaseModel.deleteMany({ customerId: new Types.ObjectId(customerId) });
    return { message: `${result.deletedCount} purchase(s) deleted successfully`, deletedCount: result.deletedCount };
  }

  // ========== LUCKY DRAW ==========

  async executeLuckyDraw() {
    const eligibleParticipations = await this.participationModel.find({ status: 'pending' });
    const eligibleCouponNumbers = eligibleParticipations.map((entry) => entry.couponNumber);
    const eligibleCycles = await this.cycleModel.find({ couponNumber: { $in: eligibleCouponNumbers } });

    const lastDraw = await this.drawModel.findOne().sort({ drawNumber: -1 }).exec();
    const drawNumber = lastDraw ? lastDraw.drawNumber + 1 : 1;

    // Generate winning number regardless of participants
    const winningNumber = this.generateWinningNumber();

    // If no participants, still create a draw record with the winning number (just no winner)
    if (eligibleParticipations.length === 0) {
      const draw = new this.drawModel({
        drawNumber,
        winningNumber,
        winnerUserId: null,
        winnerCoupon: null,
        prizeAmount: 0,
        totalParticipants: 0,
        drawDate: new Date(),
        status: 'completed',
      });
      await draw.save();

      return { message: 'No participants for the draw', draw: null };
    }

    const winnerParticipation = eligibleParticipations.find((entry) => entry.couponNumber === winningNumber);
    const winner = winnerParticipation
      ? eligibleCycles.find((cycle) => cycle.couponNumber === winnerParticipation.couponNumber)
      : undefined;

    let prizeAmount = 0;
    let winnerUserId: string | undefined;
    let winnerCoupon: string | undefined;

    if (winner) {
      // Prize follows the same day/level reward table as the other modules:
      // level 1 = PKR 1,000, level 2 = PKR 2,000, ... level 30 = PKR 30,000 (capped).
      prizeAmount = Math.min(winner.currentLevel, this.MAX_LEVELS) * this.LEVEL_BASE;
      winnerUserId = winner.customerId.toString();
      winnerCoupon = winner.couponNumber;

      // Credit the prize to the winner's main wallet
      await this.walletService.credit(winnerUserId, prizeAmount);

      // The cycle keeps accumulating shopping and stays in the draw pool after a win;
      // it only becomes permanent/completed once totalShopping reaches the level-30 threshold
      // (handled in recordPurchase). We just record the win on the existing cycle.
      winner.wonDate = new Date();
      winner.wonAmount += prizeAmount;
      winner.winCount = Number(winner.winCount || 0) + 1;
      await winner.save();

      // Notify winner
      await this.createNotification(
        winnerUserId,
        '🎉 YOU WON!',
        `Congratulations! Your coupon ${winner.couponNumber} won PKR ${prizeAmount} in Cashback Draw #${drawNumber}!`,
        'WIN',
      );

      if (winnerParticipation) {
        winnerParticipation.status = 'consumed';
        winnerParticipation.consumedAt = new Date();
        winnerParticipation.drawNumber = drawNumber;
        await winnerParticipation.save();
      }

      // Only notify other participants when someone wins
      for (const participation of eligibleParticipations) {
        if (participation.customerId.toString() !== winnerUserId) {
          await this.createNotification(
            participation.customerId.toString(),
            `Draw #${drawNumber} Result`,
            `Winning number: ${winningNumber}. A winner was found! Keep shopping to increase your chances.`,
            'DRAW',
          );
        }
      }
    }

    await this.participationModel.updateMany(
      { _id: { $in: eligibleParticipations.map((entry) => entry._id) }, status: 'pending' },
      { $set: { status: 'consumed', consumedAt: new Date(), drawNumber } },
    );

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

  // Draws with no winner are just a timestamp + a random number - once they're a day old
  // they're no longer useful and just take up space, so they're pruned. Any draw that
  // actually produced a winner (winnerUserId set) is kept forever.
  async pruneOldEmptyDraws() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.drawModel.deleteMany({
      drawDate: { $lt: cutoff },
      $or: [{ winnerUserId: null }, { winnerUserId: { $exists: false } }],
    });
    return result.deletedCount || 0;
  }

  async getNextDrawInfo() {
    const lastDraw = await this.drawModel.findOne().sort({ drawDate: -1 });
    const totalParticipants = await this.participationModel.countDocuments({ status: 'pending' });

    const now = new Date();
    const nextDrawTime = this.computeNextDrawTime(now);
    const drawNumber = lastDraw ? lastDraw.drawNumber + 1 : 1;

    const countdown = Math.max(0, Math.floor((nextDrawTime.getTime() - now.getTime()) / 1000));

    const winnerUser = lastDraw?.winnerUserId ? await this.usersService.findById(lastDraw.winnerUserId) : null;

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
            winnerName: winnerUser?.name || null,
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
    const playStatus = await this.getPlayStatus(userId);
    const totalParticipants = await this.participationModel.countDocuments({ status: 'pending' });

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
      playStatus: {
        ...playStatus,
        // Backward-compatible single-coupon fields for older frontend callers.
        hasPlayedToday: playStatus.playsAvailableToday > 0 && playStatus.playsRemainingToday === 0,
        couponNumber: activeCycle?.couponNumber || playStatus.coupons[playStatus.coupons.length - 1]?.couponNumber || null,
        enteredIntoNextDraw: playStatus.playsUsedToday > 0,
      },
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

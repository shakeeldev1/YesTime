import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CashbackController } from './cashback.controller';
import { CashbackService } from './cashback.service';
import { CashbackDrawScheduler } from './cashback-draw.scheduler';
import { Shopkeeper, ShopkeeperSchema } from './schemas/shopkeeper.schema';
import { CashbackPurchase, CashbackPurchaseSchema } from './schemas/cashback-purchase.schema';
import { CashbackCycle, CashbackCycleSchema } from './schemas/cashback-cycle.schema';
import { CashbackDraw, CashbackDrawSchema } from './schemas/cashback-draw.schema';
import { CashbackNotification, CashbackNotificationSchema } from './schemas/cashback-notification.schema';
import { WalletModule } from '../wallet/wallet.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
      { name: CashbackPurchase.name, schema: CashbackPurchaseSchema },
      { name: CashbackCycle.name, schema: CashbackCycleSchema },
      { name: CashbackDraw.name, schema: CashbackDrawSchema },
      { name: CashbackNotification.name, schema: CashbackNotificationSchema },
    ]),
    WalletModule,
    UsersModule,
  ],
  controllers: [CashbackController],
  providers: [CashbackService, CashbackDrawScheduler],
  exports: [CashbackService],
})
export class CashbackModule {}

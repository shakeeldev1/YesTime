import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RegistrationLotteryController } from './registration-lottery.controller';
import { RegistrationLotteryService } from './registration-lottery.service';
import { RegistrationDrawScheduler } from './registration-draw.scheduler';
import { RegistrationLottery, RegistrationLotterySchema } from './schemas/registration-lottery.schema';
import { RegistrationDraw, RegistrationDrawSchema } from './schemas/registration-draw.schema';
import { RegistrationNotification, RegistrationNotificationSchema } from './schemas/registration-notification.schema';
import { WalletModule } from '../wallet/wallet.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RegistrationLottery.name, schema: RegistrationLotterySchema },
      { name: RegistrationDraw.name, schema: RegistrationDrawSchema },
      { name: RegistrationNotification.name, schema: RegistrationNotificationSchema },
    ]),
    WalletModule,
    UsersModule,
  ],
  controllers: [RegistrationLotteryController],
  providers: [RegistrationLotteryService, RegistrationDrawScheduler],
  exports: [RegistrationLotteryService],
})
export class RegistrationLotteryModule {}

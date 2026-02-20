import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { GameCycle, GameCycleSchema } from './schemas/game-cycle.schema';
import { GameDraw, GameDrawSchema } from './schemas/game-draw.schema';
import { GamePayment, GamePaymentSchema } from './schemas/game-payment.schema';
import { GameNotification, GameNotificationSchema } from './schemas/game-notification.schema';
import { GameDrawScheduler } from './game-draw.scheduler';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GameCycle.name, schema: GameCycleSchema },
      { name: GameDraw.name, schema: GameDrawSchema },
      { name: GamePayment.name, schema: GamePaymentSchema },
      { name: GameNotification.name, schema: GameNotificationSchema },
    ]),
    WalletModule,
  ],
  controllers: [GameController],
  providers: [GameService, GameDrawScheduler],
  exports: [GameService],
})
export class GameModule {}

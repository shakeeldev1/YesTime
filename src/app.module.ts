import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { UsersModule } from './users/users.module';
import { ProfileModule } from './profile/profile.module';
import { WalletModule } from './wallet/wallet.module';
import { CarParticipationModule } from './car-participation/car-participation.module';
import { CarContributionsModule } from './car-contributions/car-contributions.module';
import { CarWinnerModule } from './car-winner/car-winner.module';
import { GameModule } from './game/game.module';
import { CashbackModule } from './cashback/cashback.module';
import { MailerModule } from './mailer/mailer.module';
import { RegistrationLotteryModule } from './registration-lottery/registration-lottery.module';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost/yes-time'), 
    ScheduleModule.forRoot(),
    AuthModule, 
    UsersModule, 
    ProfileModule, 
    WalletModule, 
    CarParticipationModule, 
    CarContributionsModule, 
    CarWinnerModule,
    GameModule,
    CashbackModule,
    MailerModule,
    RegistrationLotteryModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

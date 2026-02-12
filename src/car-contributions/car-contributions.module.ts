import { Module } from '@nestjs/common';
import { CarContributionsController } from './car-contributions.controller';
import { CarContributionsService } from './car-contributions.service';
import { MongooseModule } from '@nestjs/mongoose/dist/mongoose.module';
import { CarContribution, CarContributionSchema } from './schemas/car-contribution.schema';
import { Wallet, WalletSchema } from 'src/wallet/schemas/wallet.schema';
import { CarParticipation, CarParticipationSchema } from 'src/car-participation/schemas/car-participation.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: CarContribution.name, schema: CarContributionSchema },
    { name: Wallet.name, schema: WalletSchema },
    { name: CarParticipation.name, schema: CarParticipationSchema }])],
  controllers: [CarContributionsController],
  providers: [CarContributionsService]
})
export class CarContributionsModule { }

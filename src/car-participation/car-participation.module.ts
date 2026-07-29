import { Module } from '@nestjs/common';
import { CarParticipationController } from './car-participation.controller';
import { CarParticipationService } from './car-participation.service';
import { MongooseModule, Schema } from '@nestjs/mongoose';
import { CarParticipation, CarParticipationSchema } from './schemas/car-participation.schema';
import { CarPlayEntry, CarPlayEntrySchema } from './schemas/car-play-entry.schema';
import { CarContribution, CarContributionSchema } from 'src/car-contributions/schemas/car-contribution.schema';
import { CarWinner, CarWinnerSchema } from 'src/car-winner/schemas/car-winner.schema';
import { CarRequest, CarRequestSchema } from './schemas/car-request.schema';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CarParticipation.name, schema: CarParticipationSchema },
      { name: CarPlayEntry.name, schema: CarPlayEntrySchema },
      { name: CarContribution.name, schema: CarContributionSchema },
      { name: CarWinner.name, schema: CarWinnerSchema },
      { name: CarRequest.name, schema: CarRequestSchema }
    ]),
    UsersModule,
  ],
  controllers: [CarParticipationController],
  providers: [CarParticipationService],
  exports: [MongooseModule]
})
export class CarParticipationModule { }

import { Module } from '@nestjs/common';
import { CarParticipationController } from './car-participation.controller';
import { CarParticipationService } from './car-participation.service';
import { MongooseModule, Schema } from '@nestjs/mongoose';
import { CarParticipation, CarParticipationSchema } from './schemas/car-participation.schema';
import { CarPlayEntry, CarPlayEntrySchema } from './schemas/car-play-entry.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: CarParticipation.name, schema: CarParticipationSchema },
    { name: CarPlayEntry.name, schema: CarPlayEntrySchema }
  ])],
  controllers: [CarParticipationController],
  providers: [CarParticipationService],
  exports: [MongooseModule]
})
export class CarParticipationModule { }

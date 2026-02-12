import { Module } from '@nestjs/common';
import { CarParticipationController } from './car-participation.controller';
import { CarParticipationService } from './car-participation.service';
import { MongooseModule, Schema } from '@nestjs/mongoose';
import { CarParticipation, CarParticipationSchema } from './schemas/car-participation.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: CarParticipation.name, schema: CarParticipationSchema }
  ])],
  controllers: [CarParticipationController],
  providers: [CarParticipationService]
})
export class CarParticipationModule { }

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CarWinnerController } from './car-winner.controller';
import { CarWinnerService } from './car-winner.service';
import { CarWinner, CarWinnerSchema } from './schemas/car-winner.schema';
import { CarParticipationModule } from 'src/car-participation/car-participation.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CarWinner.name, schema: CarWinnerSchema }]),
    CarParticipationModule
  ],
  controllers: [CarWinnerController],
  providers: [CarWinnerService]
})
export class CarWinnerModule {}

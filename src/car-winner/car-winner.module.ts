import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CarWinnerController } from './car-winner.controller';
import { CarWinnerService } from './car-winner.service';
import { CarWinner, CarWinnerSchema } from './schemas/car-winner.schema';
import { CarParticipationModule } from 'src/car-participation/car-participation.module';
import { SpinnerDraw, SpinnerDrawSchema } from './schemas/spinner-draw.schema';
import { CarDrawScheduler } from './car-draw.scheduler';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CarWinner.name, schema: CarWinnerSchema },
      { name: SpinnerDraw.name, schema: SpinnerDrawSchema }
    ]),
    CarParticipationModule
  ],
  controllers: [CarWinnerController],
  providers: [CarWinnerService, CarDrawScheduler]
})
export class CarWinnerModule {}

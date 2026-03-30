import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CarWinnerController } from './car-winner.controller';
import { CarWinnerService } from './car-winner.service';
import { CarWinner, CarWinnerSchema } from './schemas/car-winner.schema';
import { SpinnerDraw, SpinnerDrawSchema } from './schemas/spinner-draw.schema';
import { CarParticipationModule } from 'src/car-participation/car-participation.module';
import { CarDrawScheduler } from './car-draw.scheduler';
import { User, UserSchema } from 'src/users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CarWinner.name, schema: CarWinnerSchema },
      { name: SpinnerDraw.name, schema: SpinnerDrawSchema },
      { name: User.name, schema: UserSchema }
    ]),
    CarParticipationModule
  ],
  controllers: [CarWinnerController],
  providers: [CarWinnerService, CarDrawScheduler]
})
export class CarWinnerModule {}

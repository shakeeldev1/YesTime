import { Module } from '@nestjs/common';
import { CarContributionsController } from './car-contributions.controller';
import { CarContributionsService } from './car-contributions.service';

@Module({
  controllers: [CarContributionsController],
  providers: [CarContributionsService]
})
export class CarContributionsModule {}

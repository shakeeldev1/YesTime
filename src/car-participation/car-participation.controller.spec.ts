import { Test, TestingModule } from '@nestjs/testing';
import { CarParticipationController } from './car-participation.controller';

describe('CarParticipationController', () => {
  let controller: CarParticipationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarParticipationController],
    }).compile();

    controller = module.get<CarParticipationController>(CarParticipationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

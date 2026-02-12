import { Test, TestingModule } from '@nestjs/testing';
import { CarWinnerController } from './car-winner.controller';

describe('CarWinnerController', () => {
  let controller: CarWinnerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarWinnerController],
    }).compile();

    controller = module.get<CarWinnerController>(CarWinnerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

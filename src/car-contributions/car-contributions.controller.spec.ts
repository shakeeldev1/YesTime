import { Test, TestingModule } from '@nestjs/testing';
import { CarContributionsController } from './car-contributions.controller';

describe('CarContributionsController', () => {
  let controller: CarContributionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarContributionsController],
    }).compile();

    controller = module.get<CarContributionsController>(CarContributionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

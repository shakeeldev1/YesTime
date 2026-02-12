import { Test, TestingModule } from '@nestjs/testing';
import { CarWinnerService } from './car-winner.service';

describe('CarWinnerService', () => {
  let service: CarWinnerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CarWinnerService],
    }).compile();

    service = module.get<CarWinnerService>(CarWinnerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

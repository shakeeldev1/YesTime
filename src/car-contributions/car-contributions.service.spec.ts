import { Test, TestingModule } from '@nestjs/testing';
import { CarContributionsService } from './car-contributions.service';

describe('CarContributionsService', () => {
  let service: CarContributionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CarContributionsService],
    }).compile();

    service = module.get<CarContributionsService>(CarContributionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

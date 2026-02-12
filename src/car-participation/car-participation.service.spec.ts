import { Test, TestingModule } from '@nestjs/testing';
import { CarParticipationService } from './car-participation.service';

describe('CarParticipationService', () => {
  let service: CarParticipationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CarParticipationService],
    }).compile();

    service = module.get<CarParticipationService>(CarParticipationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

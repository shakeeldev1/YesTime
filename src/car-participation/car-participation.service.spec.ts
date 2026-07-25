import { CarParticipationService } from './car-participation.service';

describe('CarParticipationService', () => {
  let service: CarParticipationService;
  let carParticipationModel: any;

  beforeEach(() => {
    const usersService = {
      findByReferralCode: jest.fn().mockResolvedValue(null),
    };

    carParticipationModel = jest.fn().mockImplementation((data?: any) => ({
      ...data,
      save: jest.fn().mockResolvedValue({ ...data }),
    }));
    carParticipationModel.findOne = jest.fn().mockResolvedValue(null);

    service = new CarParticipationService(usersService as any);
    (service as any).carParticipationModel = carParticipationModel;
  });

  it('stores joinWithQurandazi when a user joins without qurandazi', async () => {
    await service.join('user-1', 2, undefined, undefined, false);

    expect(carParticipationModel).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      planId: 2,
      joinWithQurandazi: false,
    }));
  });
});

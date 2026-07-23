// The 4 car ownership plans. Every plan follows the same ratios as the original
// (and still default) Plan 1: dailyMax = dailyMin * 30 ("a month's worth" lump sum),
// targetAmount = dailyMin * 60,000, directAwardThreshold = dailyMax * 365 (a full year
// of maxed-out daily payments), postWinMonthly = dailyMax * 24. pkrPerPlay always equals
// the plan's own dailyMin ("one minimum daily payment = one play"), so higher tiers don't
// get cheaper play chances relative to their own contribution level.
export interface CarPlan {
  id: number;
  name: string;
  dailyMin: number;
  dailyMax: number;
  pkrPerPlay: number;
  targetAmount: number;
  directAwardThreshold: number;
  postWinMonthly: number;
}

export const CAR_PLANS: CarPlan[] = [
  { id: 1, name: 'Plan 1', dailyMin: 50, dailyMax: 1500, pkrPerPlay: 50, targetAmount: 3000000, directAwardThreshold: 547500, postWinMonthly: 36000 },
  { id: 2, name: 'Plan 2', dailyMin: 100, dailyMax: 3000, pkrPerPlay: 100, targetAmount: 6000000, directAwardThreshold: 1095000, postWinMonthly: 72000 },
  { id: 3, name: 'Plan 3', dailyMin: 200, dailyMax: 6000, pkrPerPlay: 200, targetAmount: 12000000, directAwardThreshold: 2190000, postWinMonthly: 144000 },
  { id: 4, name: 'Plan 4', dailyMin: 300, dailyMax: 9000, pkrPerPlay: 300, targetAmount: 18000000, directAwardThreshold: 3285000, postWinMonthly: 288000 },
];

export const DEFAULT_CAR_PLAN_ID = 1;

export function isValidCarPlanId(planId: unknown): planId is number {
  return typeof planId === 'number' && CAR_PLANS.some((plan) => plan.id === planId);
}

export function getCarPlan(planId?: number | null): CarPlan {
  return CAR_PLANS.find((plan) => plan.id === planId) || CAR_PLANS[0];
}

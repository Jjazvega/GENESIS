export const calculateBudgetVariance = (actual = 0, planned = 0) => ({
  actual,
  planned,
  variance: actual - planned,
  varianceRate: planned === 0 ? 0 : (actual - planned) / planned,
});

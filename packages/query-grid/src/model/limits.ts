export const PAGE_LIMIT_MAX = 1000;

export interface GridLimits {
  pageLimit: number;
  countCap: number;
  searchLimit: number;
  searchBudgetMs: number;
  narrowLimit: number;
}

export const DEFAULT_LIMITS: GridLimits = {
  pageLimit: 200,
  countCap: 10_000,
  searchLimit: 500,
  searchBudgetMs: 120,
  narrowLimit: 100_000,
};

const LIMIT_KEYS = Object.keys(DEFAULT_LIMITS) as (keyof GridLimits)[];

export function resolveLimits(overrides: Partial<GridLimits> = {}): GridLimits {
  const limits = { ...DEFAULT_LIMITS };
  for (const key of LIMIT_KEYS) {
    const value = overrides[key];
    if (value === undefined) {
      continue;
    }
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`limit ${key} must be a positive integer`);
    }
    limits[key] = value;
  }
  if (limits.pageLimit > PAGE_LIMIT_MAX) {
    throw new Error(`limit pageLimit is at most ${PAGE_LIMIT_MAX}`);
  }
  return limits;
}

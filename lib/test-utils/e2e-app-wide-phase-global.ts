/** Playwright `page.evaluate` / Vitest 에서 `__samarketAppWidePhaseLastMs` 접근 시 TS 안전 캐스트 */

export const APP_WIDE_PHASE_LAST_MS_KEY = "__samarketAppWidePhaseLastMs" as const;

export type AppWidePhasePerfGlobal = typeof globalThis & {
  [APP_WIDE_PHASE_LAST_MS_KEY]?: Record<string, number>;
  performance?: Performance & { memory?: { usedJSHeapSize?: number } };
};

export function asAppWidePhasePerfGlobal(): AppWidePhasePerfGlobal {
  return globalThis as AppWidePhasePerfGlobal;
}

export function writeAppWidePhaseMetric(key: string, value: number): void {
  const g = asAppWidePhasePerfGlobal();
  const bag = { ...(g[APP_WIDE_PHASE_LAST_MS_KEY] ?? {}), [key]: value };
  g[APP_WIDE_PHASE_LAST_MS_KEY] = bag;
}

export function readAppWidePhaseMetric(key: string): number | undefined {
  return asAppWidePhasePerfGlobal()[APP_WIDE_PHASE_LAST_MS_KEY]?.[key];
}

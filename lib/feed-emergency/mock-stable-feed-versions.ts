/**
 * 34단계: 안정 버전 후보 mock (fallback 우선순위 참조용)
 */

import type { StableFeedVersion } from "@/lib/types/feed-emergency";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const now = new Date().toISOString();

const STABLE: StableFeedVersion[] = [
  {
    id: "sfv-home-1",
    surface: "home",
    versionId: "fv-control-home",
    stabilityScore: 0.95,
    avgCtr: 0.042,
    avgConversionRate: 0.08,
    markedAt: now,
    note: "기본 대조군",
  },
];

export function getStableFeedVersions(
  surface?: RecommendationSurface
): StableFeedVersion[] {
  if (surface) return STABLE.filter((s) => s.surface === surface);
  return [...STABLE];
}

export function addStableFeedVersion(
  input: Omit<StableFeedVersion, "id" | "markedAt">
): StableFeedVersion {
  const now = new Date().toISOString();
  const row: StableFeedVersion = {
    ...input,
    id: `sfv-${input.surface}-${Date.now()}`,
    markedAt: now,
  };
  STABLE.push(row);
  return row;
}

export function removeStableFeedVersion(id: string): boolean {
  const i = STABLE.findIndex((s) => s.id === id);
  if (i === -1) return false;
  STABLE.splice(i, 1);
  return true;
}

/**
 * Admin ordered lexicographic ranking criteria for BROWSE default list.
 * No weighted scoring. REPEAT_ORDER / FAVORITE are not implementable (no list authority).
 */

export const STORES_BROWSE_RANKING_CRITERION_IDS = [
  "distance",
  "popular",
  "rating",
  "reviews",
  "district",
  "fast",
] as const;

export type StoresBrowseRankingCriterionId = (typeof STORES_BROWSE_RANKING_CRITERION_IDS)[number];

/** Lossless encoding of post-eligibility recommended comparator keys. */
export const STORES_BROWSE_CANONICAL_DEFAULT_CRITERIA: readonly StoresBrowseRankingCriterionId[] = [
  "district",
  "distance",
  "popular",
  "rating",
  "reviews",
];

const CRITERION_SET = new Set<string>(STORES_BROWSE_RANKING_CRITERION_IDS);

export function parseStoresBrowseRankingCriteria(raw: unknown): StoresBrowseRankingCriterionId[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: StoresBrowseRankingCriterionId[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim().toLowerCase();
    if (!CRITERION_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as StoresBrowseRankingCriterionId);
  }
  return out.length > 0 ? out : null;
}

export function rankingCriteriaFromProductConfig(
  cfg: Record<string, unknown> | null | undefined
): StoresBrowseRankingCriterionId[] | null {
  if (!cfg || typeof cfg !== "object") return null;
  if (!("rankingCriteria" in cfg)) return null;
  return parseStoresBrowseRankingCriteria(cfg.rankingCriteria);
}

export function resolveStoresBrowseRankingCriteria(
  parsed: StoresBrowseRankingCriterionId[] | null | undefined
): StoresBrowseRankingCriterionId[] {
  return parsed && parsed.length > 0 ? [...parsed] : [...STORES_BROWSE_CANONICAL_DEFAULT_CRITERIA];
}

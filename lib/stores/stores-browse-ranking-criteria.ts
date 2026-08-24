/**
 * Admin-facing BROWSE default ranking keys — order only, no weights.
 * DISTRICT / FAST stay internal tie-breaks and are not operator controls.
 */

export const STORES_BROWSE_ADMIN_RANKING_CRITERION_IDS = [
  "popular",
  "distance",
  "rating",
  "reviews",
] as const;

export type StoresBrowseAdminRankingCriterionId =
  (typeof STORES_BROWSE_ADMIN_RANKING_CRITERION_IDS)[number];

/** Internal comparators still used after the admin stack. Not Admin UI. */
export const STORES_BROWSE_INTERNAL_RANKING_CRITERION_IDS = ["district", "fast"] as const;

export type StoresBrowseRankingCriterionId =
  | StoresBrowseAdminRankingCriterionId
  | (typeof STORES_BROWSE_INTERNAL_RANKING_CRITERION_IDS)[number];

/** Operator default order: 주문량 → 거리 → 평점 → 리뷰 */
export const STORES_BROWSE_CANONICAL_DEFAULT_CRITERIA: readonly StoresBrowseAdminRankingCriterionId[] =
  STORES_BROWSE_ADMIN_RANKING_CRITERION_IDS;

const ADMIN_SET = new Set<string>(STORES_BROWSE_ADMIN_RANKING_CRITERION_IDS);

export function parseStoresBrowseRankingCriteria(
  raw: unknown
): StoresBrowseAdminRankingCriterionId[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: StoresBrowseAdminRankingCriterionId[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim().toLowerCase();
    if (!ADMIN_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as StoresBrowseAdminRankingCriterionId);
  }
  return out.length > 0 ? out : null;
}

export function rankingCriteriaFromProductConfig(
  cfg: Record<string, unknown> | null | undefined
): StoresBrowseAdminRankingCriterionId[] | null {
  if (!cfg || typeof cfg !== "object") return null;
  if (!("rankingCriteria" in cfg)) return null;
  return parseStoresBrowseRankingCriteria(cfg.rankingCriteria);
}

export function resolveStoresBrowseRankingCriteria(
  parsed: StoresBrowseAdminRankingCriterionId[] | null | undefined
): StoresBrowseAdminRankingCriterionId[] {
  const out: StoresBrowseAdminRankingCriterionId[] = [];
  const seen = new Set<string>();
  if (parsed) {
    for (const id of parsed) {
      if (!ADMIN_SET.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  if (out.length > 0) return out;
  return [...STORES_BROWSE_CANONICAL_DEFAULT_CRITERIA];
}

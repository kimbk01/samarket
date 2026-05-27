import { STORES_BROWSE_SUB_ALL } from "@/components/stores/browse/stores-browse-paths";
import type { BrowseSubIndustry } from "@/lib/stores/browse-mock/types";

/** 2차 칩 하이라이트 — topic slug 만 (`all`·빈 값은 칩 없음) */
export function resolveBrowseMatchedSubSlug(
  trimmedSubParam: string,
  subs: BrowseSubIndustry[],
): string | null {
  const p = trimmedSubParam.trim().toLowerCase();
  if (!p || p === STORES_BROWSE_SUB_ALL) return null;
  const hit = subs.find((s) => s.slug.toLowerCase() === p);
  return hit ? hit.slug : null;
}

export function resolveBrowseSubChipActiveSlug(
  optimisticSub: string | null,
  matchedTopicSlug: string | null,
): string | null {
  const raw = optimisticSub ?? matchedTopicSlug;
  if (!raw || raw.toLowerCase() === STORES_BROWSE_SUB_ALL) return null;
  return raw;
}

/**
 * 목록 API `sub` — `?sub=all`·없음·비정상 → 항상 `all`(1차 전체 매장).
 * 2차 칩을 고르면 해당 topic slug.
 */
export function resolveBrowseListQuerySub(
  optimisticSub: string | null,
  matchedTopicSlug: string | null,
): string {
  const chip = resolveBrowseSubChipActiveSlug(optimisticSub, matchedTopicSlug);
  if (chip) return chip;
  return STORES_BROWSE_SUB_ALL;
}

/** canonical — `sub` 없음·유효하지 않은 slug → `?sub=all` (목록 전체, 칩 UI 없음) */
export function shouldCanonicalizeBrowseSubToAll(
  trimmedSubParam: string,
  subs: BrowseSubIndustry[],
): boolean {
  const p = trimmedSubParam.trim().toLowerCase();
  if (!p) return true;
  if (p === STORES_BROWSE_SUB_ALL) return false;
  if (subs.length === 0) return false;
  return !subs.some((s) => s.slug.toLowerCase() === p);
}

import { STORES_BROWSE_SUB_ALL } from "@/components/stores/browse/stores-browse-paths";
import type { BrowseSubIndustry } from "@/lib/stores/browse-taxonomy-ui-types";

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

/**
 * 2차 칩·목록 API 공통 active slug.
 * taxonomy 로드 전에도 URL `?sub=` 를 신뢰(로드 후 canonical 이 보정).
 */
export function resolveBrowseSubChipActiveSlug(
  trimmedSubParam: string,
  optimisticSub: string | null,
  matchedTopicSlug: string | null,
): string | null {
  const raw = optimisticSub ?? matchedTopicSlug;
  if (raw && raw.toLowerCase() !== STORES_BROWSE_SUB_ALL) return raw;
  const p = trimmedSubParam.trim().toLowerCase();
  if (p && p !== STORES_BROWSE_SUB_ALL) return p;
  return null;
}

/** 목록 API `sub` — URL·optimistic·matched 순, 없으면 `all`(1차 전체) */
export function resolveBrowseListQuerySub(
  trimmedSubParam: string,
  optimisticSub: string | null,
  matchedTopicSlug: string | null,
): string {
  const optimistic = optimisticSub?.trim().toLowerCase();
  if (optimistic && optimistic !== STORES_BROWSE_SUB_ALL) return optimisticSub!;
  if (matchedTopicSlug) return matchedTopicSlug;
  const p = trimmedSubParam.trim().toLowerCase();
  if (!p || p === STORES_BROWSE_SUB_ALL) return STORES_BROWSE_SUB_ALL;
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

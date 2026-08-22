import { STORES_BROWSE_SUB_ALL } from "@/components/stores/browse/stores-browse-paths";
import type { BrowseSubPendingNav } from "@/lib/stores/browse-sub-chip-navigation";
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

function isSubUrlSettled(
  trimmedSubParam: string,
  matchedTopicSlug: string | null,
  targetSub: string
): boolean {
  const urlSub = trimmedSubParam.trim().toLowerCase();
  if (urlSub === targetSub) return true;
  if (matchedTopicSlug?.toLowerCase() === targetSub) return true;
  return false;
}

/**
 * 2차 칩 active slug — URL canonical; pending 은 transition 중 pathname primary 일치 시만.
 */
export function resolveBrowseSubChipActiveSlug(
  trimmedSubParam: string,
  matchedTopicSlug: string | null,
  pathnamePrimary: string,
  pending: BrowseSubPendingNav | null,
): string | null {
  const pathPrimary = pathnamePrimary.trim().toLowerCase();
  if (pending && pathPrimary === pending.primarySlug) {
    if (!isSubUrlSettled(trimmedSubParam, matchedTopicSlug, pending.targetSub)) {
      return pending.targetSub === STORES_BROWSE_SUB_ALL ? null : pending.targetSub;
    }
  }
  const raw = matchedTopicSlug;
  if (raw && raw.toLowerCase() !== STORES_BROWSE_SUB_ALL) return raw;
  const p = trimmedSubParam.trim().toLowerCase();
  if (p && p !== STORES_BROWSE_SUB_ALL) return p;
  return null;
}

/** 목록 API `sub` — URL canonical; pending 은 transition 중만 */
export function resolveBrowseListQuerySub(
  trimmedSubParam: string,
  matchedTopicSlug: string | null,
  pathnamePrimary: string,
  pending: BrowseSubPendingNav | null,
): string {
  const pathPrimary = pathnamePrimary.trim().toLowerCase();
  if (pending && pathPrimary === pending.primarySlug) {
    if (!isSubUrlSettled(trimmedSubParam, matchedTopicSlug, pending.targetSub)) {
      return pending.targetSub;
    }
  }
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

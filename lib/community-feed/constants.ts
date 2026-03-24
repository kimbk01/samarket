export const DEFAULT_COMMUNITY_SECTION = "dongnae";

/** 피드 정렬: URL `sort` 쿼리와 동기화 (기본 최신순) */
export type CommunityFeedSortMode = "latest" | "popular" | "recommended";

export function normalizeFeedSort(raw: string | undefined | null): CommunityFeedSortMode {
  const s = raw?.trim().toLowerCase();
  if (s === "popular") return "popular";
  if (s === "recommended") return "recommended";
  return "latest";
}

export function normalizeSectionSlug(raw: string | undefined | null): string {
  const s = raw?.trim().toLowerCase();
  return s || DEFAULT_COMMUNITY_SECTION;
}

/** 섹션·주제 slug: 소문자, 숫자, 하이픈만 */
export function normalizeFeedSlug(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

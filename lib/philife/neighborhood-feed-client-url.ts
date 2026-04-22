import { philifeNeighborhoodFeedUrl } from "@domain/philife/api";

export const NEIGHBORHOOD_FEED_PAGE_SIZE = 20;

/** 세션 캐시 키 — 지역과 무관한 전역 필라이프 피드 */
export const PHILIFE_GLOBAL_FEED_SESSION_KEY = "__philife_global";

export function buildPhilifeNeighborhoodFeedClientUrl(input: {
  /** true면 지역 없이 전체 글(주제·관심이웃·차단만 적용). 필라이프 홈 기본 */
  globalFeed?: boolean;
  /** `globalFeed` 가 아닐 때만 필요 (레거시·직접 호출) */
  locationKey?: string;
  /** `neighborhoodLocationMetaFromRegion` 결과 또는 null */
  meta?: { city: string; district: string; name: string; label: string } | null;
  /** meta.name 대체용 라벨 (Region 라벨 등) */
  locationLabelFallback?: string;
  regionLabel?: string | null;
  category?: string;
  neighborOnly?: boolean;
  /** 내 글 목록 등 */
  authorUserId?: string;
  offset?: number;
  limit?: number;
  /** `community` neighborhood-feed `sort` — `recommend*` 탭의 최신/추천 등 */
  sort?: "latest" | "popular" | "recommended";
}): string {
  const p = new URLSearchParams();
  if (input.globalFeed) {
    p.set("globalFeed", "1");
  } else {
    p.set("locationKey", input.locationKey ?? "");
    const m = input.meta;
    p.set("city", m?.city ?? "");
    p.set("district", m?.district ?? "");
    p.set("name", m?.name ?? (input.locationLabelFallback || input.regionLabel?.trim() || ""));
  }
  p.set("limit", String(input.limit ?? NEIGHBORHOOD_FEED_PAGE_SIZE));
  p.set("offset", String(input.offset ?? 0));
  if (input.category) p.set("category", input.category);
  if (input.sort) p.set("sort", input.sort);
  if (input.neighborOnly) p.set("neighborOnly", "1");
  const aid = input.authorUserId?.trim();
  if (aid) p.set("authorId", aid);
  return philifeNeighborhoodFeedUrl(p.toString());
}

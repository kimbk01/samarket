import { normalizeFeedSlug } from "@/lib/community-feed/constants";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";

/**
 * `is_feed_sort` 행만 의미 — 인기(조회수) vs 추천(랭킹·하위 정렬).
 * DB `community_topics.feed_sort_mode` + 레거시(slug) 추론.
 */
export type CommunityTopicFeedSortMode = "popular" | "recommended";

export function parseCommunityTopicFeedSortMode(value: unknown): CommunityTopicFeedSortMode | null {
  if (value === "popular" || value === "recommended") return value;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "popular" || s === "recommended") return s as CommunityTopicFeedSortMode;
  }
  return null;
}

/** DB 컬럼 누락·null 시 slug(레거시)로 popular / recommend 결정 */
export function resolveTopicFeedSortMode(topic: CommunityTopicDTO): CommunityTopicFeedSortMode | null {
  if (!topic.is_feed_sort) return null;
  const fromDb = parseCommunityTopicFeedSortMode(topic.feed_sort_mode);
  if (fromDb) return fromDb;
  const sl = normalizeFeedSlug(topic.slug);
  if (sl === "popular") return "popular";
  if (sl === "recommend" || sl === "recommended") return "recommended";
  /** `is_feed_sort` 만 켜져 있고 모드·slug가 정렬 토픽이 아닌 주제(오설정)는 일반 `topic` 필터로 취급 */
  return null;
}

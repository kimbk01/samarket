/**
 * 어드민 `community_topics`(동네 피드 섹션 — 기본 `dongnae`, 운영은 admin_settings) ↔ 필라이프 동네 피드·글쓰기 연동
 */

import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { listTopicsForSectionSlug } from "@/lib/community-feed/queries";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";
import {
  normalizeCommunityFeedListSkin,
  type CommunityFeedListSkin,
} from "@/lib/community-feed/topic-feed-skin";
import { NEIGHBORHOOD_CATEGORY_LABELS } from "@/lib/neighborhood/categories";

export type PhilifeNeighborhoodFeedChip = {
  slug: string;
  name: string;
};

export type PhilifeNeighborhoodWriteTopicOption = {
  slug: string;
  name: string;
};

/** 프로세스 내 짧은 TTL — 피드·주제 API가 매 요청마다 동일 주제를 중복 조회하지 않도록 */
let philifeSectionTopicsCache: { topics: CommunityTopicDTO[]; expiresAt: number } | null = null;
const PHILIFE_SECTION_TOPICS_TTL_MS = 45_000;

/** 섹션 기준 피드 주제 행 (서버 프로세스 메모리 캐시, TTL 약 45초) */
export async function loadPhilifeDefaultSectionTopics(): Promise<CommunityTopicDTO[]> {
  const now = Date.now();
  if (philifeSectionTopicsCache && philifeSectionTopicsCache.expiresAt > now) {
    return philifeSectionTopicsCache.topics;
  }
  const slug = await getPhilifeNeighborhoodSectionSlugServer();
  const topics = await listTopicsForSectionSlug(slug);
  philifeSectionTopicsCache = { topics, expiresAt: now + PHILIFE_SECTION_TOPICS_TTL_MS };
  return topics;
}

/** 이미 로드한 `topics`로 category 쿼리 허용 여부 판별 — 추가 DB 라운드트립 없음 */
export function isPhilifeFeedCategorySlugAllowedByTopics(topics: CommunityTopicDTO[], slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s) return false;
  if (s === "meetup") {
    return topics.some((t) => t.allow_meetup);
  }
  return topics.some(
    (t) => !t.is_feed_sort && !t.allow_meetup && t.slug.trim().toLowerCase() === s
  );
}

/** 홈 피드 상단 칩: `is_feed_sort` 제외, `allow_meetup` 은 단일 「모임」칩으로 묶음 */
export function buildPhilifeFeedChipsFromTopics(topics: CommunityTopicDTO[]): PhilifeNeighborhoodFeedChip[] {
  const chips: PhilifeNeighborhoodFeedChip[] = [];
  let meetupAdded = false;
  for (const t of topics) {
    if (t.is_feed_sort) continue;
    if (t.allow_meetup) {
      if (!meetupAdded) {
        chips.push({
          slug: "meetup",
          name: NEIGHBORHOOD_CATEGORY_LABELS.meetup,
        });
        meetupAdded = true;
      }
      continue;
    }
    chips.push({ slug: t.slug, name: t.name });
  }
  return chips;
}

/** 일반 글쓰기(오픈채팅 제외) 카테고리 — 모임 전용 주제 제외 */
export function buildPhilifeWriteTopicOptionsFromTopics(
  topics: CommunityTopicDTO[]
): PhilifeNeighborhoodWriteTopicOption[] {
  return topics
    .filter((t) => !t.is_feed_sort && !t.allow_meetup)
    .map((t) => ({ slug: t.slug, name: t.name }));
}

/** 글 카드·상세 라벨 — DB 주제명 우선, 없으면 레거시 상수, 없으면 slug */
export function buildPhilifeTopicNameLookup(topics: CommunityTopicDTO[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of topics) {
    if (t.is_feed_sort) continue;
    m.set(t.slug.trim().toLowerCase(), t.name);
  }
  let meetupLabel = NEIGHBORHOOD_CATEGORY_LABELS.meetup;
  for (const t of topics) {
    if (t.allow_meetup) {
      meetupLabel = t.name?.trim() || meetupLabel;
      break;
    }
  }
  m.set("meetup", meetupLabel);
  return m;
}

/** 주제 slug → `community_topics.feed_list_skin` (모임 칩 `meetup` 은 첫 `allow_meetup` 주제와 동일) */
export function buildPhilifeTopicFeedListSkinLookup(topics: CommunityTopicDTO[]): Map<string, CommunityFeedListSkin> {
  const m = new Map<string, CommunityFeedListSkin>();
  for (const t of topics) {
    if (t.is_feed_sort) continue;
    if (!t.allow_meetup) {
      m.set(t.slug.trim().toLowerCase(), normalizeCommunityFeedListSkin(t.feed_list_skin));
    }
  }
  for (const t of topics) {
    if (t.allow_meetup) {
      m.set("meetup", normalizeCommunityFeedListSkin(t.feed_list_skin));
      break;
    }
  }
  return m;
}

export function buildPhilifeTopicColorLookup(topics: CommunityTopicDTO[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const t of topics) {
    if (t.is_feed_sort) continue;
    if (!t.allow_meetup) {
      m.set(t.slug.trim().toLowerCase(), t.color);
    }
  }
  for (const t of topics) {
    if (t.allow_meetup) {
      m.set("meetup", t.color);
      break;
    }
  }
  return m;
}

export function labelForNeighborhoodPostCategory(
  categorySlug: string,
  topicNameBySlug: Map<string, string>
): string {
  const s = categorySlug.trim().toLowerCase();
  if (!s) return "";
  return (
    topicNameBySlug.get(s) ??
    (NEIGHBORHOOD_CATEGORY_LABELS as Record<string, string>)[s] ??
    categorySlug
  );
}

/**
 * 피드·상세 배지·스킨·칩 필터용 slug.
 * `community_posts.topic_slug`(어드민 주제)가 있으면 우선하고, 옛 글은 `category` enum만 사용.
 */
export function neighborhoodPostTopicUiSlug(row: { category?: unknown; topic_slug?: unknown }): string {
  const ts = String(row.topic_slug ?? "").trim().toLowerCase();
  if (ts) return ts;
  const c = String(row.category ?? "etc").trim().toLowerCase() || "etc";
  return c;
}

/** URL·쿼리 `category` 가 피드 필터로 허용되는지 (어드민 노출 주제와 동기) */
export async function isPhilifeNeighborhoodFeedFilterSlugAllowed(slug: string): Promise<boolean> {
  const topics = await loadPhilifeDefaultSectionTopics();
  return isPhilifeFeedCategorySlugAllowedByTopics(topics, slug);
}

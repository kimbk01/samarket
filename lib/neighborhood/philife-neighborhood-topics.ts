/**
 * 어드민 `community_topics`(동네 피드 섹션 — 기본 `dongnae`, 운영은 admin_settings) ↔ 필라이프 동네 피드·글쓰기 연동
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getPhilifeNeighborhoodSectionResolvedServer,
  type PhilifeSectionResolveTimings,
} from "@/lib/community-feed/philife-neighborhood-section";
import {
  listTopicsForSectionSlug,
  mapCommunityTopicRowsToDto,
  type PhilifeTopicsListQueryTimings,
} from "@/lib/community-feed/queries";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";
import {
  normalizeCommunityFeedListSkin,
  type CommunityFeedListSkin,
} from "@/lib/community-feed/topic-feed-skin";
import { NEIGHBORHOOD_CATEGORY_LABELS } from "@/lib/neighborhood/categories";
import { runSingleFlight } from "@/lib/http/run-single-flight";

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
const PHILIFE_TOPICS_FLIGHT_KEY = "philife:default-section-topics";

const collectTopicsDiag = process.env.NODE_ENV === "development";

/** 마지막 `loadPhilifeDefaultSectionTopics` 콜드 경로 분해 — 개발 전용, 동시 요청 시 마지막 완료분만 유효 */
export type PhilifeTopicsColdLoadMetrics = {
  topics_cache_hit: boolean;
  /** `admin_settings` 기반 normalize 후보 slug — 없으면 null */
  section_slug_candidate: string | null;
  resolved_slug: string;
  /** `getPhilife…Resolved` 가 `sectionId` 를 줘 `listTopics` 가 섹션 id 조회를 생략했는지 */
  section_id_lookup_skipped: boolean;
  community_topics_query_rounds: number;
  topics_settings_lookup_ms: number;
  topics_section_resolve_ms: number;
  topics_topics_query_ms: number;
  topics_topics_fallback_ms: number;
  /** `runSingleFlight` 콜백 내부(섹션 해석 + 토픽 목록) 벽시계 */
  topics_total_ms: number;
  /** DB RPC 한 번으로 admin+section+topics 처리 여부 */
  topics_unified_rpc?: boolean;
};

let lastPhilifeTopicsColdMetrics: PhilifeTopicsColdLoadMetrics | null = null;

export function peekLastPhilifeTopicsColdMetrics(): PhilifeTopicsColdLoadMetrics | null {
  return lastPhilifeTopicsColdMetrics;
}

function setTopicsCacheHitMetrics(): void {
  if (!collectTopicsDiag) return;
  lastPhilifeTopicsColdMetrics = {
    topics_cache_hit: true,
    section_slug_candidate: null,
    resolved_slug: "",
    section_id_lookup_skipped: false,
    community_topics_query_rounds: 0,
    topics_settings_lookup_ms: 0,
    topics_section_resolve_ms: 0,
    topics_topics_query_ms: 0,
    topics_topics_fallback_ms: 0,
    topics_total_ms: 0,
    topics_unified_rpc: false,
  };
}

type PhilifeTopicsRpcPayload = {
  resolved_slug?: string;
  section_slug_candidate?: string;
  topics?: unknown;
};

async function tryLoadPhilifeDefaultTopicsViaDbRpc(): Promise<{
  topics: CommunityTopicDTO[];
  rpcMs: number;
  meta: { resolved_slug: string; section_slug_candidate: string };
} | null> {
  try {
    const sb = getSupabaseServer();
    const t0 = performance.now();
    const { data, error } = await sb.rpc("philife_list_default_section_topics_for_feed");
    const rpcMs = performance.now() - t0;
    if (error || data == null) return null;
    const root = data as PhilifeTopicsRpcPayload;
    const raw = root.topics;
    if (!Array.isArray(raw)) return null;
    const topics = mapCommunityTopicRowsToDto(raw as Record<string, unknown>[]);
    return {
      topics,
      rpcMs,
      meta: {
        resolved_slug: String(root.resolved_slug ?? "dongnae"),
        section_slug_candidate: String(root.section_slug_candidate ?? "dongnae"),
      },
    };
  } catch {
    return null;
  }
}

/** 섹션 기준 피드 주제 행 (서버 프로세스 메모리 캐시, TTL 약 45초) */
export async function loadPhilifeDefaultSectionTopics(): Promise<CommunityTopicDTO[]> {
  const now = Date.now();
  if (philifeSectionTopicsCache && philifeSectionTopicsCache.expiresAt > now) {
    setTopicsCacheHitMetrics();
    return philifeSectionTopicsCache.topics;
  }
  return runSingleFlight(PHILIFE_TOPICS_FLIGHT_KEY, async () => {
    const hit = philifeSectionTopicsCache;
    if (hit && hit.expiresAt > Date.now()) {
      setTopicsCacheHitMetrics();
      return hit.topics;
    }
    const tInner0 = performance.now();
    const rpcPack = await tryLoadPhilifeDefaultTopicsViaDbRpc();
    let topics: CommunityTopicDTO[];
    if (rpcPack) {
      topics = rpcPack.topics;
      philifeSectionTopicsCache = {
        topics,
        expiresAt: Date.now() + PHILIFE_SECTION_TOPICS_TTL_MS,
      };
      if (collectTopicsDiag) {
        lastPhilifeTopicsColdMetrics = {
          topics_cache_hit: false,
          section_slug_candidate: rpcPack.meta.section_slug_candidate,
          resolved_slug: rpcPack.meta.resolved_slug,
          section_id_lookup_skipped: true,
          community_topics_query_rounds: 1,
          topics_settings_lookup_ms: 0,
          topics_section_resolve_ms: 0,
          topics_topics_query_ms: Math.round(rpcPack.rpcMs),
          topics_topics_fallback_ms: 0,
          topics_total_ms: Math.round(performance.now() - tInner0),
          topics_unified_rpc: true,
        };
      }
      return topics;
    }

    const sectionTimings: PhilifeSectionResolveTimings = {
      topics_settings_lookup_ms: 0,
      topics_section_resolve_ms: 0,
    };
    const listTimings: PhilifeTopicsListQueryTimings = {
      topics_topics_query_ms: 0,
      topics_topics_fallback_ms: 0,
      communityTopicsQueryRounds: 0,
    };
    const resolved = await getPhilifeNeighborhoodSectionResolvedServer(
      undefined,
      collectTopicsDiag ? sectionTimings : undefined
    );
    topics = await listTopicsForSectionSlug(
      resolved.slug,
      {
        sectionId: resolved.sectionId ? resolved.sectionId : undefined,
        timings: collectTopicsDiag ? listTimings : undefined,
      }
    );
    philifeSectionTopicsCache = {
      topics,
      expiresAt: Date.now() + PHILIFE_SECTION_TOPICS_TTL_MS,
    };
    if (collectTopicsDiag) {
      lastPhilifeTopicsColdMetrics = {
        topics_cache_hit: false,
        section_slug_candidate: resolved.topicsAdminCandidateSlug,
        resolved_slug: resolved.slug,
        section_id_lookup_skipped: Boolean(resolved.sectionId),
        community_topics_query_rounds: listTimings.communityTopicsQueryRounds,
        topics_settings_lookup_ms: Math.round(sectionTimings.topics_settings_lookup_ms),
        topics_section_resolve_ms: Math.round(sectionTimings.topics_section_resolve_ms),
        topics_topics_query_ms: Math.round(listTimings.topics_topics_query_ms),
        topics_topics_fallback_ms: Math.round(listTimings.topics_topics_fallback_ms),
        topics_total_ms: Math.round(performance.now() - tInner0),
        topics_unified_rpc: false,
      };
    }
    return topics;
  });
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

/**
 * 동네 피드 섹션 `community_topics`에 해당 slug 행이 있으면(정렬 전용 주제 포함) 「전체」탭에서 노출.
 * 어드민에 보이는 주제·글과 필라이프 누락을 맞추기 위함.
 */
export function sectionHasTopicSlug(topics: CommunityTopicDTO[], slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s) return false;
  if (s === "meetup") {
    return topics.some((t) => t.allow_meetup);
  }
  return topics.some((t) => t.slug.trim().toLowerCase() === s);
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

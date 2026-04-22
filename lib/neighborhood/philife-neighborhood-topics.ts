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
  /** 어드민 `is_feed_sort` — 정렬 전용 토픽(추천/인기 등) */
  is_feed_sort: boolean;
  /**
   * 정렬 토픽이면 UI 분기(추천: 드롭다운 등) — `slug` 가 아래에 안 맞으면 `null` 이고 일반 탭으로만 쓴다.
   */
  sort_slot: "recommend" | "popular" | null;
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

/** API·캐시 토픽 목록은 어드민「노출 Y」인 행만(모임/일반 공통). */
function onlyVisibleForFeedSectionTopics(topics: CommunityTopicDTO[]): CommunityTopicDTO[] {
  return topics.filter((t) => t.is_visible);
}

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
      topics = onlyVisibleForFeedSectionTopics(rpcPack.topics);
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
    const listed = await listTopicsForSectionSlug(
      resolved.slug,
      {
        sectionId: resolved.sectionId ? resolved.sectionId : undefined,
        timings: collectTopicsDiag ? listTimings : undefined,
      }
    );
    topics = onlyVisibleForFeedSectionTopics(listed);
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

/**
 * `community_topics` / 필라이프 섹션 설정이 바뀐 직후 호출 — `loadPhilifeDefaultSectionTopics` 메모 캐시·진단을 비운다.
 * 어드민 API에서 저장·삭제 시 호출해 `/api/philife/neighborhood-*` 와 /philife 칩이 즉시 갱신되게 한다.
 */
export function clearPhilifeDefaultSectionTopicsCache(): void {
  philifeSectionTopicsCache = null;
  if (collectTopicsDiag) {
    lastPhilifeTopicsColdMetrics = null;
  }
}

/** 이미 로드한 `topics`로 category 쿼리 허용 여부 판별 — 추가 DB 라운드트립 없음 */
export function isPhilifeFeedCategorySlugAllowedByTopics(topics: CommunityTopicDTO[], slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s) return false;
  if (s === "meetup") {
    return topics.some((t) => t.allow_meetup && t.is_visible);
  }
  /** `is_feed_sort` 도 동일 `community_topics` 행 — 노출 Y이면 칩·category 필터 모두 허용(이전: 정렬칩은 탭에서 제외됨) */
  return topics.some(
    (t) => t.is_visible && !t.allow_meetup && t.slug.trim().toLowerCase() === s
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
    return topics.some((t) => t.allow_meetup && t.is_visible);
  }
  return topics.some(
    (t) => t.is_visible && t.slug.trim().toLowerCase() === s
  );
}

/**
 * 홈 피드 상단 칩: `loadPhilife…`가 노출·활성인 주제만 넘김. `is_feed_sort`(정렬칩)이어도 **탭에 표시**해 어드민「노출」과 맞춤.
 * `allow_meetup` 은 단일 「모임」칩으로 묶음.
 */
export function buildPhilifeFeedChipsFromTopics(topics: CommunityTopicDTO[]): PhilifeNeighborhoodFeedChip[] {
  const chips: PhilifeNeighborhoodFeedChip[] = [];
  let meetupAdded = false;
  for (const t of topics) {
    if (t.allow_meetup && t.is_visible) {
      if (!meetupAdded) {
        const name = t.name?.trim() || NEIGHBORHOOD_CATEGORY_LABELS.meetup;
        chips.push({
          slug: "meetup",
          name,
          is_feed_sort: false,
          sort_slot: null,
        });
        meetupAdded = true;
      }
      continue;
    }
    if (t.is_visible) {
      const sl = t.slug.trim().toLowerCase();
      let sort_slot: "recommend" | "popular" | null = null;
      if (t.is_feed_sort) {
        if (sl === "recommend" || sl === "recommended") sort_slot = "recommend";
        else if (sl === "popular") sort_slot = "popular";
      }
      chips.push({
        slug: t.slug,
        name: t.name,
        is_feed_sort: t.is_feed_sort,
        sort_slot,
      });
    }
  }
  return chips;
}

/**
 * `/philife/write` 일반(동네) 글 — `POST /api/.../neighborhood-posts` + `resolveTopicForNeighborhoodCategory` 와 동일.
 * - `is_visible` + `!is_feed_sort` + **`allow_meetup === false`** (모임 전용·정렬칩 제외)
 */
export function buildPhilifeWriteTopicOptionsFromTopics(
  topics: CommunityTopicDTO[]
): PhilifeNeighborhoodWriteTopicOption[] {
  return topics
    .filter((t) => t.is_visible && !t.is_feed_sort && !t.allow_meetup)
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        String(a.name).localeCompare(String(b.name), "ko")
    )
    .map((t) => ({
      slug: t.slug.trim(),
      name: t.name?.trim() || t.slug.trim(),
    }));
}

/** 글 카드·상세 라벨 — DB 주제명 우선, 없으면 레거시 상수, 없으면 slug */
export function buildPhilifeTopicNameLookup(topics: CommunityTopicDTO[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of topics) {
    if (t.is_visible) {
      m.set(t.slug.trim().toLowerCase(), t.name);
    }
  }
  let meetupLabel = NEIGHBORHOOD_CATEGORY_LABELS.meetup;
  for (const t of topics) {
    if (t.allow_meetup && t.is_visible) {
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
    if (t.is_visible && !t.allow_meetup) {
      m.set(t.slug.trim().toLowerCase(), normalizeCommunityFeedListSkin(t.feed_list_skin));
    }
  }
  for (const t of topics) {
    if (t.allow_meetup && t.is_visible) {
      m.set("meetup", normalizeCommunityFeedListSkin(t.feed_list_skin));
      break;
    }
  }
  return m;
}

export function buildPhilifeTopicColorLookup(topics: CommunityTopicDTO[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const t of topics) {
    if (t.is_visible && !t.allow_meetup) {
      m.set(t.slug.trim().toLowerCase(), t.color);
    }
  }
  for (const t of topics) {
    if (t.allow_meetup && t.is_visible) {
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

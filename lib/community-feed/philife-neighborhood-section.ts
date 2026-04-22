import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { DEFAULT_COMMUNITY_SECTION, normalizeSectionSlug } from "@/lib/community-feed/constants";

/** `admin_settings` — 필라이프 동네 피드·모임 주제가 붙는 `community_sections.slug` */
export const PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY = "philife_neighborhood_section";

/** `admin_settings.philife_neighborhood_section` 의 `value_json` */
export type PhilifeNeighborhoodSectionSettingsV1 = {
  section_slug?: string;
  /**
   * true(기본): 필라이프 피드 상단 「전체」칩(미분류) 노출.
   * false: 어드민 `피드 주제 관리`에서 숨긴 것과 같이, 첫 토픽칩부터만 보임.
   */
  show_all_feed_tab?: boolean;
  /**
   * true(기본): 주제 칩 아래「관심이웃 글만 보기」영역(체크·안내) 전체 표시.
   * false: 해당 섹터 UI 비노출(API·neighborOnly 파라미터도 사용하지 않음).
   */
  show_neighbor_only_filter?: boolean;
};

type Stored = PhilifeNeighborhoodSectionSettingsV1;

/** `loadPhilifeDefaultSectionTopics` 진단용 — 선택 인자로만 채움 */
export type PhilifeSectionResolveTimings = {
  topics_settings_lookup_ms: number;
  topics_section_resolve_ms: number;
};

export type PhilifeNeighborhoodSectionResolved = {
  slug: string;
  /** `community_sections.id` — 설정 없음·검증 실패 시 null (`listTopicsForSectionSlug` 가 slug로 한 번 더 조회) */
  sectionId: string | null;
  /**
   * `admin_settings` 기준 normalize 전까지만 반영한 slug 후보(빈 문자열이면 설정 없음).
   * `listTopicsForSectionSlug` 에 넘기는 `slug` 와 동일한 normalize 결과가 섹션 행이 있을 때만 의미 있음.
   */
  topicsAdminCandidateSlug: string | null;
};

const defaultResolved = (): PhilifeNeighborhoodSectionResolved => ({
  slug: DEFAULT_COMMUNITY_SECTION,
  sectionId: null,
  topicsAdminCandidateSlug: null,
});

/**
 * 섹션 slug + `community_sections.id` 를 한 번에 해석.
 * `listTopicsForSectionSlug` 에 `sectionId` 를 넘기면 동일 요청 내 `community_sections` 중복 조회를 생략한다.
 */
export async function getPhilifeNeighborhoodSectionResolvedServer(
  sb?: SupabaseClient,
  fillTimings?: PhilifeSectionResolveTimings
): Promise<PhilifeNeighborhoodSectionResolved> {
  let client: SupabaseClient;
  try {
    client = (sb ?? getSupabaseServer()) as SupabaseClient;
  } catch {
    return defaultResolved();
  }

  try {
    const tSet = performance.now();
    const { data, error } = await client
      .from("admin_settings")
      .select("value_json")
      .eq("key", PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY)
      .maybeSingle();
    if (fillTimings) {
      fillTimings.topics_settings_lookup_ms += performance.now() - tSet;
    }
    if (error && !error.message?.includes("does not exist")) {
      return defaultResolved();
    }
    const raw = (data as { value_json?: unknown } | null)?.value_json;
    const parsed = raw && typeof raw === "object" ? (raw as Stored) : null;
    const candidate = normalizeSectionSlug(parsed?.section_slug ?? "");
    if (!candidate) {
      return defaultResolved();
    }

    const tSec = performance.now();
    const { data: sec } = await client
      .from("community_sections")
      .select("id, slug")
      .eq("slug", candidate)
      .eq("is_active", true)
      .maybeSingle();
    if (fillTimings) {
      fillTimings.topics_section_resolve_ms += performance.now() - tSec;
    }
    const row = sec as { id?: string; slug?: string } | null;
    const slugRaw = row?.slug != null ? String(row.slug) : "";
    if (slugRaw) {
      const slug = normalizeSectionSlug(slugRaw) || DEFAULT_COMMUNITY_SECTION;
      const sectionId = row?.id != null && String(row.id).trim() ? String(row.id).trim() : null;
      return { slug, sectionId, topicsAdminCandidateSlug: candidate };
    }
    return {
      slug: DEFAULT_COMMUNITY_SECTION,
      sectionId: null,
      topicsAdminCandidateSlug: candidate,
    };
  } catch {
    /* fallback */
  }
  return defaultResolved();
}

function parseSettingsV1(valueJson: unknown): PhilifeNeighborhoodSectionSettingsV1 {
  if (!valueJson || typeof valueJson !== "object") return {};
  return { ...(valueJson as PhilifeNeighborhoodSectionSettingsV1) };
}

/**
 * `philife_neighborhood_section` value_json — 섹션 해석 없이 JSON 만 읽을 때(전체탭 등).
 */
export async function getPhilifeNeighborhoodSectionSettingsV1Server(
  sb?: SupabaseClient
): Promise<PhilifeNeighborhoodSectionSettingsV1> {
  let client: SupabaseClient;
  try {
    client = (sb ?? getSupabaseServer()) as SupabaseClient;
  } catch {
    return {};
  }
  try {
    const { data, error } = await client
      .from("admin_settings")
      .select("value_json")
      .eq("key", PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY)
      .maybeSingle();
    if (error && !error.message?.includes("does not exist")) return {};
    return parseSettingsV1((data as { value_json?: unknown } | null)?.value_json);
  } catch {
    return {};
  }
}

/** 필라이프 상단「전체」탭( slug 빈 값 )을 보여줄지. `show_all_feed_tab: false` 만 숨김(기본 true). */
export async function getPhilifeShowAllFeedTabServer(sb?: SupabaseClient): Promise<boolean> {
  const s = await getPhilifeNeighborhoodSectionSettingsV1Server(sb);
  return s.show_all_feed_tab !== false;
}

/**「관심이웃 글만 보기」필터 띠 전체(체크+안내)를 보여줄지. `show_neighbor_only_filter: false` 면 비노출(기본 true). */
export async function getPhilifeShowNeighborOnlyFilterServer(sb?: SupabaseClient): Promise<boolean> {
  const s = await getPhilifeNeighborhoodSectionSettingsV1Server(sb);
  return s.show_neighbor_only_filter !== false;
}

/**
 * 동네 피드에 사용할 섹션 slug (미설정·무효면 `dongnae`).
 * `sb`를 넘기면 동일 클라이언트로 조회(트랜잭션 불필요 시 중복 클라이언트 방지).
 */
export async function getPhilifeNeighborhoodSectionSlugServer(sb?: SupabaseClient): Promise<string> {
  const r = await getPhilifeNeighborhoodSectionResolvedServer(sb);
  return r.slug;
}

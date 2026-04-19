import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { DEFAULT_COMMUNITY_SECTION, normalizeSectionSlug } from "@/lib/community-feed/constants";

/** `admin_settings` — 필라이프 동네 피드·모임 주제가 붙는 `community_sections.slug` */
export const PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY = "philife_neighborhood_section";

type Stored = { section_slug?: string };

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

/**
 * 동네 피드에 사용할 섹션 slug (미설정·무효면 `dongnae`).
 * `sb`를 넘기면 동일 클라이언트로 조회(트랜잭션 불필요 시 중복 클라이언트 방지).
 */
export async function getPhilifeNeighborhoodSectionSlugServer(sb?: SupabaseClient): Promise<string> {
  const r = await getPhilifeNeighborhoodSectionResolvedServer(sb);
  return r.slug;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { DEFAULT_COMMUNITY_SECTION, normalizeSectionSlug } from "@/lib/community-feed/constants";

/** `admin_settings` — 필라이프 동네 피드·모임 주제가 붙는 `community_sections.slug` */
export const PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY = "philife_neighborhood_section";

type Stored = { section_slug?: string };

/**
 * 동네 피드에 사용할 섹션 slug (미설정·무효면 `dongnae`).
 * `sb`를 넘기면 동일 클라이언트로 조회(트랜잭션 불필요 시 중복 클라이언트 방지).
 */
export async function getPhilifeNeighborhoodSectionSlugServer(sb?: SupabaseClient): Promise<string> {
  let client: SupabaseClient;
  try {
    client = (sb ?? getSupabaseServer()) as SupabaseClient;
  } catch {
    return DEFAULT_COMMUNITY_SECTION;
  }

  try {
    const { data, error } = await client
      .from("admin_settings")
      .select("value_json")
      .eq("key", PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY)
      .maybeSingle();
    if (error && !error.message?.includes("does not exist")) {
      return DEFAULT_COMMUNITY_SECTION;
    }
    const raw = (data as { value_json?: unknown } | null)?.value_json;
    const parsed = raw && typeof raw === "object" ? (raw as Stored) : null;
    const candidate = normalizeSectionSlug(parsed?.section_slug ?? "");
    if (!candidate) return DEFAULT_COMMUNITY_SECTION;

    const { data: sec } = await client
      .from("community_sections")
      .select("slug")
      .eq("slug", candidate)
      .eq("is_active", true)
      .maybeSingle();
    const slug = (sec as { slug?: string } | null)?.slug;
    if (slug) return normalizeSectionSlug(slug) || DEFAULT_COMMUNITY_SECTION;
  } catch {
    /* fallback */
  }
  return DEFAULT_COMMUNITY_SECTION;
}

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import { parseCommunityTopicFeedSortMode } from "@/lib/community-feed/feed-sort-mode";
import { normalizeCommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";

/** 관리자 목록용 — 신규 섹션 연동 주제 */
export type CommunityTopicAdminRow = {
  id: string;
  section_id: string;
  section_slug: string | null;
  section_name: string | null;
  name: string;
  name_en: string | null;
  slug: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  is_visible: boolean;
  is_feed_sort: boolean;
  /** is_feed_sort 일 때: popular=조회, recommended=랭킹+하위정렬 */
  feed_sort_mode: "popular" | "recommended" | null;
  allow_question: boolean;
  allow_meetup: boolean;
  feed_list_skin: ReturnType<typeof normalizeCommunityFeedListSkin>;
};

const ADMIN_TOPICS_SELECT_WITH_SKIN =
  "id, section_id, name, name_en, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, feed_sort_mode, allow_question, allow_meetup, feed_list_skin, community_sections ( slug, name )";
const ADMIN_TOPICS_SELECT_NO_SKIN =
  "id, section_id, name, name_en, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, feed_sort_mode, allow_question, allow_meetup, community_sections ( slug, name )";

/** 관리자: 전체 주제 (실패 시 [] — 기존 호출부 호환). 관리자 화면은 `loadAllCommunityTopicsForAdmin` 을 쓴다. */
export async function listAllCommunityTopicsForAdmin(): Promise<CommunityTopicAdminRow[]> {
  return (await loadAllCommunityTopicsForAdmin()).rows;
}

/**
 * 관리자: 전체 주제 — 조회 실패를 빈 목록과 구분한다 (관리자 화면 오류 상태용).
 * error = DB 오류 코드(`db_…`) 또는 load_failed.
 */
export async function loadAllCommunityTopicsForAdmin(): Promise<
  { ok: true; rows: CommunityTopicAdminRow[] } | { ok: false; rows: CommunityTopicAdminRow[]; error: string }
> {
  try {
    const sb = getSupabaseServer();
    const a1 = await sb
      .from("community_topics")
      .select(ADMIN_TOPICS_SELECT_WITH_SKIN)
      .order("sort_order", { ascending: true });
    let adminRows: unknown = a1.data;
    let error = a1.error;
    if (error && isMissingDbColumnError(error, "name_en")) {
      const aEn = await sb
        .from("community_topics")
        .select(
          "id, section_id, name, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, feed_sort_mode, allow_question, allow_meetup, feed_list_skin, community_sections ( slug, name )"
        )
        .order("sort_order", { ascending: true });
      adminRows = aEn.data;
      error = aEn.error;
    }
    if (error && isMissingDbColumnError(error, "feed_sort_mode")) {
      const sel =
        "id, section_id, name, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, allow_question, allow_meetup, feed_list_skin, community_sections ( slug, name )";
      const a0 = await sb.from("community_topics").select(sel).order("sort_order", { ascending: true });
      adminRows = a0.data;
      error = a0.error;
    } else if (error && isMissingDbColumnError(error, "feed_list_skin")) {
      const a2 = await sb
        .from("community_topics")
        .select(ADMIN_TOPICS_SELECT_NO_SKIN)
        .order("sort_order", { ascending: true });
      adminRows = a2.data;
      error = a2.error;
    }
    if (error) return { ok: false, rows: [], error: error.code ? `db_${error.code}` : "load_failed" };
    if (!Array.isArray(adminRows)) return { ok: false, rows: [], error: "load_failed" };
    const rows: CommunityTopicAdminRow[] = (adminRows as Record<string, unknown>[]).map((r) => {
      const sec = r.community_sections as { slug?: string; name?: string } | null;
      return {
        id: String(r.id),
        section_id: String(r.section_id ?? ""),
        section_slug: sec?.slug ?? null,
        section_name: sec?.name ?? null,
        name: String(r.name ?? ""),
        name_en: r.name_en != null && String(r.name_en).trim() ? String(r.name_en) : null,
        slug: String(r.slug ?? ""),
        icon: r.icon != null ? String(r.icon) : null,
        color: r.color != null ? String(r.color) : null,
        sort_order: Number(r.sort_order ?? 0),
        is_active: !!r.is_active,
        is_visible: !!r.is_visible,
        is_feed_sort: !!r.is_feed_sort,
        feed_sort_mode: parseCommunityTopicFeedSortMode(r.feed_sort_mode),
        allow_question: !!r.allow_question,
        allow_meetup: !!r.allow_meetup,
        feed_list_skin: normalizeCommunityFeedListSkin(r.feed_list_skin),
      };
    });
    return { ok: true, rows };
  } catch {
    return { ok: false, rows: [], error: "load_failed" };
  }
}

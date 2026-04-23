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

/** @deprecated 피드는 community_feed/queries 의 listTopicsForSectionSlug 사용 */
export type CommunityTopicRow = {
  id: string;
  scope: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

const LEGACY_SELECT = "id, scope, name, slug, icon, sort_order, is_active";

export async function listCommunityTopicsByScope(
  scope: "local" | "group" | "common"
): Promise<CommunityTopicRow[]> {
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("community_topics_legacy")
      .select(LEGACY_SELECT)
      .eq("scope", scope)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error || !data?.length) return [];
    return data as CommunityTopicRow[];
  } catch {
    return [];
  }
}

const ADMIN_TOPICS_SELECT_WITH_SKIN =
  "id, section_id, name, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, feed_sort_mode, allow_question, allow_meetup, feed_list_skin, community_sections ( slug, name )";
const ADMIN_TOPICS_SELECT_NO_SKIN =
  "id, section_id, name, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, feed_sort_mode, allow_question, allow_meetup, community_sections ( slug, name )";

export async function listAllCommunityTopicsForAdmin(): Promise<CommunityTopicAdminRow[]> {
  try {
    const sb = getSupabaseServer();
    const a1 = await sb
      .from("community_topics")
      .select(ADMIN_TOPICS_SELECT_WITH_SKIN)
      .order("sort_order", { ascending: true });
    let adminRows: unknown = a1.data;
    let error = a1.error;
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
    if (error || !Array.isArray(adminRows)) return [];
    return (adminRows as Record<string, unknown>[]).map((r) => {
      const sec = r.community_sections as { slug?: string; name?: string } | null;
      return {
        id: String(r.id),
        section_id: String(r.section_id ?? ""),
        section_slug: sec?.slug ?? null,
        section_name: sec?.name ?? null,
        name: String(r.name ?? ""),
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
  } catch {
    return [];
  }
}

export async function isValidLocalTopicId(topicId: string): Promise<boolean> {
  const id = topicId?.trim();
  if (!id) return false;
  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("community_topics")
      .select("id")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();
    if (!error && (data as { id?: string } | null)?.id) return true;

    const { data: leg } = await sb
      .from("community_topics_legacy")
      .select("id")
      .eq("id", id)
      .eq("scope", "local")
      .eq("is_active", true)
      .maybeSingle();
    return !!(leg as { id?: string } | null)?.id;
  } catch {
    return false;
  }
}

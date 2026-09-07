import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";
import { COMMUNITY_POST_FEED_STATUS_ACTIVE } from "@/lib/neighborhood/community-post-contract";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import { normalizeCommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";
import type { CommunityFeedPostDTO } from "@/lib/community-feed/types";
import { formatCommunityPublicRegionLabel } from "@/lib/addresses/community-public-region-label";

type Sb = ReturnType<typeof getSupabaseServer>;

const MINIMAL_POST_COLS =
  "id, section_slug, topic_slug, title, summary, region_label, view_count, like_count, comment_count, created_at, user_id, is_hidden";

const BASE_POST_COLS =
  "id, section_slug, topic_slug, title, summary, region_label, is_question, is_meetup, meetup_date, meetup_place, view_count, like_count, comment_count, created_at, user_id, is_deleted, is_hidden, status";

const EMBED_WITH_SKIN =
  `${BASE_POST_COLS}, community_topics ( name, name_en, slug, color, feed_list_skin )`;
const EMBED_NO_SKIN =
  `${BASE_POST_COLS}, community_topics ( name, name_en, slug, color )`;

function logListCommunityPostsForUserIssue(
  phase: string,
  userId: string,
  error: { message?: string } | null
): void {
  const msg = error?.message?.trim();
  if (!msg) return;
  console.warn("[listCommunityPostsForUser]", { phase, userId, error: msg });
}

function authorPostsQuery(sb: Sb, selectCols: string, uid: string, rowLimit: number, withStatus: boolean) {
  let q = sb.from("community_posts").select(selectCols).eq("user_id", uid).eq("is_hidden", false);
  if (withStatus) {
    q = q.eq("status", COMMUNITY_POST_FEED_STATUS_ACTIVE);
  }
  return q.order("created_at", { ascending: false }).limit(rowLimit);
}

async function runAuthorPostsSelect(
  sb: Sb,
  selectCols: string,
  uid: string,
  rowLimit: number,
  withStatus: boolean
): Promise<{ data: unknown; error: PostgrestError | null }> {
  return authorPostsQuery(sb, selectCols, uid, rowLimit, withStatus);
}

async function fetchAuthorPostRows(
  sb: Sb,
  uid: string,
  rowLimit: number
): Promise<Record<string, unknown>[]> {
  const q1 = await runAuthorPostsSelect(sb, EMBED_WITH_SKIN, uid, rowLimit, true);
  if (!q1.error && Array.isArray(q1.data)) {
    return q1.data as Record<string, unknown>[];
  }
  logListCommunityPostsForUserIssue("embed_with_skin", uid, q1.error);

  if (q1.error && isMissingDbColumnError(q1.error, "feed_list_skin")) {
    const q2 = await runAuthorPostsSelect(sb, EMBED_NO_SKIN, uid, rowLimit, true);
    if (!q2.error && Array.isArray(q2.data)) {
      return q2.data as Record<string, unknown>[];
    }
    logListCommunityPostsForUserIssue("embed_no_skin", uid, q2.error);
  }

  const q3 = await runAuthorPostsSelect(sb, BASE_POST_COLS, uid, rowLimit, true);
  if (!q3.error && Array.isArray(q3.data)) {
    return q3.data as Record<string, unknown>[];
  }
  logListCommunityPostsForUserIssue("base_columns", uid, q3.error);

  if (q3.error && isMissingDbColumnError(q3.error, "status")) {
    const q4 = await runAuthorPostsSelect(sb, BASE_POST_COLS, uid, rowLimit, false);
    if (!q4.error && Array.isArray(q4.data)) {
      return q4.data as Record<string, unknown>[];
    }
    logListCommunityPostsForUserIssue("base_columns_no_status", uid, q4.error);
  }

  const q5 = await runAuthorPostsSelect(sb, MINIMAL_POST_COLS, uid, rowLimit, false);
  if (q5.error) {
    logListCommunityPostsForUserIssue("minimal_columns", uid, q5.error);
    return [];
  }
  if (!Array.isArray(q5.data)) return [];
  return q5.data as Record<string, unknown>[];
}

function mapAuthorPostRow(
  r: Record<string, unknown>,
  uid: string,
  nickMap: Map<string, string>,
  thumbByPost: Map<string, string | null>
): CommunityFeedPostDTO {
  const topic = r.community_topics as {
    name?: string;
    name_en?: string | null;
    slug?: string;
    color?: string | null;
    feed_list_skin?: unknown;
  } | null;
  const topicSlug = String(r.topic_slug ?? topic?.slug ?? "");
  const summaryRaw = r.summary != null ? String(r.summary) : "";
  return {
    id: String(r.id),
    section_slug: String(r.section_slug ?? ""),
    topic_slug: topicSlug,
    topic_name: String(topic?.name ?? topicSlug),
    topic_name_en: topic?.name_en != null && String(topic.name_en).trim() ? String(topic.name_en) : null,
    topic_color: topic?.color ?? null,
    feed_list_skin: normalizeCommunityFeedListSkin(topic?.feed_list_skin),
    title: String(r.title ?? ""),
    content: summaryRaw,
    summary: summaryRaw || "",
    region_label: formatCommunityPublicRegionLabel({
      regionLabel: String(r.region_label ?? ""),
    }),
    is_question: !!r.is_question,
    is_meetup: !!r.is_meetup,
    meetup_date: r.meetup_date != null ? String(r.meetup_date) : null,
    meetup_place: r.meetup_place != null ? String(r.meetup_place) : null,
    view_count: Number(r.view_count ?? 0),
    like_count: Number(r.like_count ?? 0),
    comment_count: Number(r.comment_count ?? 0),
    created_at: String(r.created_at ?? ""),
    author_name: nickMap.get(uid) ?? uid.slice(0, 8),
    thumbnail_url: thumbByPost.get(String(r.id)) ?? null,
  };
}

/**
 * 작성자 기준 커뮤니티 글 목록 — SSOT: `community_posts`.
 * embed join 실패 시 base 컬럼만 조회하는 fallback을 실행한다.
 */
export async function listCommunityPostsForUser(
  userId: string,
  limit = 100
): Promise<CommunityFeedPostDTO[]> {
  const uid = userId?.trim();
  if (!uid) return [];
  const rowLimit = Math.min(Math.max(Math.floor(limit) || 100, 1), 100);

  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch (err) {
    logListCommunityPostsForUserIssue("supabase_init", uid, {
      message: err instanceof Error ? err.message : "supabase_unavailable",
    });
    return [];
  }

  const rawRows = await fetchAuthorPostRows(sb, uid, rowLimit);
  const rows = rawRows.filter((r) => isCommunityPostPubliclyVisible(r as never));
  if (rows.length === 0) return [];

  const nickMap = await fetchNicknamesForUserIds(sb as never, [uid]);
  const ids = rows.map((r) => String(r.id));
  const { data: thumbs } = await sb
    .from("community_post_images")
    .select("post_id, image_url, sort_order")
    .in("post_id", ids)
    .order("sort_order", { ascending: true });

  const thumbByPost = new Map<string, string | null>();
  if (Array.isArray(thumbs)) {
    for (const im of thumbs as { post_id?: string; image_url?: string | null }[]) {
      const pid = String(im.post_id ?? "");
      const u = im.image_url ?? null;
      if (pid && !thumbByPost.has(pid) && u) thumbByPost.set(pid, u);
    }
  }

  return rows.map((r) => mapAuthorPostRow(r, uid, nickMap, thumbByPost));
}

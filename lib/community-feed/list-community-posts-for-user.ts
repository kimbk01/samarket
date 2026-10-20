import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";
import { COMMUNITY_POST_FEED_STATUS_ACTIVE } from "@/lib/neighborhood/community-post-contract";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import { normalizeCommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";
import type { CommunityFeedPostDTO } from "@/lib/community-feed/types";
import { formatCommunityPublicRegionLabel } from "@/lib/addresses/community-public-region-label";
import { resolveCommunityAuthorForFeedRow } from "@/lib/community/resolve-community-author";
import {
  isCommunityImportedOrigin,
  normalizeCommunityPostOriginKind,
} from "@/lib/community/community-post-origin";
import {
  mypageKeysetOrFilter,
  sliceMypageKeysetPage,
  type MypageListCursor,
} from "@/lib/mypage/mypage-list-cursor";

type Sb = ReturnType<typeof getSupabaseServer>;

const ORIGIN_COLS = "origin_kind, display_author_name, display_author_avatar_url";

const MINIMAL_POST_COLS =
  "id, section_slug, topic_slug, title, summary, region_label, view_count, like_count, comment_count, created_at, user_id, is_hidden";

const BASE_POST_COLS =
  "id, section_slug, topic_slug, title, summary, region_label, is_question, is_meetup, meetup_date, meetup_place, view_count, like_count, comment_count, created_at, user_id, is_deleted, is_hidden, status";

const EMBED_WITH_SKIN = (withOrigin: boolean) =>
  `${BASE_POST_COLS}${withOrigin ? `, ${ORIGIN_COLS}` : ""}, community_topics ( name, name_en, slug, color, feed_list_skin )`;
const EMBED_NO_SKIN = (withOrigin: boolean) =>
  `${BASE_POST_COLS}${withOrigin ? `, ${ORIGIN_COLS}` : ""}, community_topics ( name, name_en, slug, color )`;
const MINIMAL_WITH_ORIGIN = (withOrigin: boolean) =>
  `${MINIMAL_POST_COLS}${withOrigin ? `, ${ORIGIN_COLS}` : ""}`;
const BASE_WITH_ORIGIN = (withOrigin: boolean) =>
  `${BASE_POST_COLS}${withOrigin ? `, ${ORIGIN_COLS}` : ""}`;

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

/** 모든 select 시도가 실패하면 `null` — 「글 없음」(빈 배열)과 구분 */
async function fetchAuthorPostRows(
  sb: Sb,
  uid: string,
  rowLimit: number
): Promise<Record<string, unknown>[] | null> {
  const trySelect = async (cols: string) => runAuthorPostsSelect(sb, cols, uid, rowLimit, true);

  for (const withOrigin of [true, false]) {
    const q1 = await trySelect(EMBED_WITH_SKIN(withOrigin));
    if (!q1.error && Array.isArray(q1.data)) {
      return q1.data as Record<string, unknown>[];
    }
    logListCommunityPostsForUserIssue(withOrigin ? "embed_with_skin" : "embed_with_skin_no_origin", uid, q1.error);
    if (q1.error && isMissingDbColumnError(q1.error, "feed_list_skin")) {
      const q2 = await trySelect(EMBED_NO_SKIN(withOrigin));
      if (!q2.error && Array.isArray(q2.data)) {
        return q2.data as Record<string, unknown>[];
      }
      logListCommunityPostsForUserIssue(withOrigin ? "embed_no_skin" : "embed_no_skin_no_origin", uid, q2.error);
    }
    if (withOrigin && q1.error && isMissingDbColumnError(q1.error, "origin_kind")) {
      continue;
    }
  }

  for (const withOrigin of [true, false]) {
    const q3 = await trySelect(BASE_WITH_ORIGIN(withOrigin));
    if (!q3.error && Array.isArray(q3.data)) {
      return q3.data as Record<string, unknown>[];
    }
    logListCommunityPostsForUserIssue(withOrigin ? "base_columns" : "base_columns_no_origin", uid, q3.error);
    if (q3.error && isMissingDbColumnError(q3.error, "status")) {
      logListCommunityPostsForUserIssue(
        withOrigin ? "base_columns_no_status" : "base_columns_no_status_no_origin",
        uid,
        q3.error
      );
      const q4 = await runAuthorPostsSelect(sb, BASE_WITH_ORIGIN(withOrigin), uid, rowLimit, false);
      if (!q4.error && Array.isArray(q4.data)) {
        return q4.data as Record<string, unknown>[];
      }
    }
    if (withOrigin && q3.error && isMissingDbColumnError(q3.error, "origin_kind")) continue;
  }

  for (const withOrigin of [true, false]) {
    const q5 = await runAuthorPostsSelect(sb, MINIMAL_WITH_ORIGIN(withOrigin), uid, rowLimit, false);
    if (!q5.error && Array.isArray(q5.data)) {
      return q5.data as Record<string, unknown>[];
    }
    logListCommunityPostsForUserIssue(withOrigin ? "minimal_columns" : "minimal_no_origin", uid, q5.error);
    if (withOrigin && q5.error && isMissingDbColumnError(q5.error, "origin_kind")) continue;
  }
  return null;
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
  const author = resolveCommunityAuthorForFeedRow(
    {
      origin_kind: r.origin_kind,
      user_id: String(r.user_id ?? uid),
      display_author_name: r.display_author_name,
      display_author_avatar_url: r.display_author_avatar_url,
      profile_display_name: nickMap.get(uid) ?? null,
      profile_avatar_url: null,
    },
    (ownerId) => (ownerId ? ownerId.slice(0, 8) : "익명")
  );
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
    author_name: author.display_name,
    origin_kind: author.origin_kind ?? normalizeCommunityPostOriginKind(r.origin_kind),
    thumbnail_url: thumbByPost.get(String(r.id)) ?? null,
  };
}

export type ListCommunityPostsForUserResult =
  | { ok: true; posts: CommunityFeedPostDTO[] }
  | { ok: false; error: "supabase_unavailable" | "posts_query_failed" };

/**
 * 작성자 기준 커뮤니티 글 목록(결과형) — 조회 실패를 빈 목록과 구분한다.
 * 내정보 요약(`communityPostsCount`)은 실패를 0 으로 보이지 않게 이 함수를 쓴다.
 */
export async function listCommunityPostsForUserResult(
  userId: string,
  limit = 100
): Promise<ListCommunityPostsForUserResult> {
  const uid = userId?.trim();
  if (!uid) return { ok: true, posts: [] };
  const rowLimit = Math.min(Math.max(Math.floor(limit) || 100, 1), 100);

  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch (err) {
    logListCommunityPostsForUserIssue("supabase_init", uid, {
      message: err instanceof Error ? err.message : "supabase_unavailable",
    });
    return { ok: false, error: "supabase_unavailable" };
  }

  const rawRows = await fetchAuthorPostRows(sb, uid, rowLimit);
  if (rawRows == null) return { ok: false, error: "posts_query_failed" };
  const rows = rawRows.filter((r) => isCommunityPostPubliclyVisible(r as never));
  if (rows.length === 0) return { ok: true, posts: [] };

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

  return { ok: true, posts: rows.map((r) => mapAuthorPostRow(r, uid, nickMap, thumbByPost)) };
}

/**
 * 작성자 기준 커뮤니티 글 목록 — SSOT: `community_posts`.
 * embed join 실패 시 base 컬럼만 조회하는 fallback을 실행한다.
 * 기존 소비자 호환: 조회 실패는 빈 배열(동작 불변). 실패 구분이 필요하면 `listCommunityPostsForUserResult`.
 */
export async function listCommunityPostsForUser(
  userId: string,
  limit = 100
): Promise<CommunityFeedPostDTO[]> {
  const res = await listCommunityPostsForUserResult(userId, limit);
  return res.ok ? res.posts : [];
}

/* ------------------------------------------------------------------------------------------------
 * 내정보 「내가 쓴 글」 owner 페이지 (최종 설계 C.0.3 A4 · S26) — 함수 추가만, 위 공개용 함수는 불변.
 * 범위: `user_id = 본인` · 삭제 글 제외(`is_deleted=true` 또는 `status='deleted'`).
 *   active = 공개 가시(`isCommunityPostPubliclyVisible`) · hidden = `is_hidden=true` 또는 `status='hidden'`(삭제 제외).
 * keyset `created_at desc, id desc`, 커서 `created_at|id`. 조회 실패는 `ok:false`(빈 목록 금지).
 * ---------------------------------------------------------------------------------------------- */

export type OwnCommunityPostStatus = "active" | "hidden";

export type OwnCommunityPostDTO = CommunityFeedPostDTO & {
  isHiddenForOwner: boolean;
  /** 숨김 사유 — 현재 스키마에 사유 컬럼이 없어 항상 생략(있으면 1줄 표시) */
  hiddenReason?: string;
  /** 가져온 글(`origin_kind` 외부) — 수정·삭제 불가 */
  isImported: boolean;
};

export type ListOwnCommunityPostsPageResult =
  | { ok: true; posts: OwnCommunityPostDTO[]; next_cursor: string | null; total?: number }
  | { ok: false; error: "supabase_unavailable" | "posts_query_failed" };

const OWN_PAGE_SCAN_BATCH = 100;

function isOwnPostDeleted(r: Record<string, unknown>): boolean {
  return r.is_deleted === true || String(r.status ?? "").trim().toLowerCase() === "deleted";
}

/** owner 탭 술어 — 삭제 글은 어느 탭에도 없다 */
export function ownCommunityPostMatchesStatus(r: Record<string, unknown>, status: OwnCommunityPostStatus): boolean {
  if (isOwnPostDeleted(r)) return false;
  const s = String(r.status ?? "").trim().toLowerCase();
  const hidden = r.is_hidden === true || s === "hidden";
  // 공개 피드 쿼리(`is_hidden=false` + 공개 가시)와 같은 기준
  if (status === "active") return !hidden && isCommunityPostPubliclyVisible(r as never);
  return hidden;
}

async function fetchOwnPostRowsBatch(
  sb: Sb,
  uid: string,
  cursor: MypageListCursor | null
): Promise<Record<string, unknown>[] | null> {
  const attempts = [EMBED_WITH_SKIN(true), EMBED_NO_SKIN(true), BASE_WITH_ORIGIN(true), BASE_WITH_ORIGIN(false)];
  for (const cols of attempts) {
    let q = sb
      .from("community_posts")
      .select(cols)
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(OWN_PAGE_SCAN_BATCH);
    if (cursor) q = q.or(mypageKeysetOrFilter(cursor, "created_at"));
    const { data, error } = await q;
    if (!error && Array.isArray(data)) return data as unknown as Record<string, unknown>[];
    logListCommunityPostsForUserIssue("own_page", uid, error);
  }
  return null;
}

async function countOwnCommunityPosts(sb: Sb, uid: string, status: OwnCommunityPostStatus): Promise<number | null> {
  for (const cols of ["id, status, is_hidden, is_deleted", "id, is_hidden, is_deleted"]) {
    const { data, error } = await sb.from("community_posts").select(cols).eq("user_id", uid);
    if (!error && Array.isArray(data)) {
      return (data as unknown as Record<string, unknown>[]).filter((r) => ownCommunityPostMatchesStatus(r, status))
        .length;
    }
    logListCommunityPostsForUserIssue("own_count", uid, error);
  }
  return null;
}

export async function listOwnCommunityPostsPage(
  userId: string,
  opts: { status: OwnCommunityPostStatus; limit: number; cursor: MypageListCursor | null; withTotal?: boolean }
): Promise<ListOwnCommunityPostsPageResult> {
  const uid = userId?.trim();
  if (!uid) return { ok: true, posts: [], next_cursor: null, ...(opts.withTotal ? { total: 0 } : {}) };
  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return { ok: false, error: "supabase_unavailable" };
  }

  const want = opts.limit + 1;
  const matched: Record<string, unknown>[] = [];
  let scan: MypageListCursor | null = opts.cursor;
  for (;;) {
    const rows = await fetchOwnPostRowsBatch(sb, uid, scan);
    if (rows == null) return { ok: false, error: "posts_query_failed" };
    for (const r of rows) if (ownCommunityPostMatchesStatus(r, opts.status)) matched.push(r);
    if (matched.length >= want || rows.length < OWN_PAGE_SCAN_BATCH) break;
    const last = rows[rows.length - 1]!;
    scan = { ts: String(last.created_at ?? ""), id: String(last.id ?? "") };
    if (!scan.ts || !scan.id) break;
  }
  const page = sliceMypageKeysetPage(
    matched,
    opts.limit,
    (r) => String(r.created_at ?? ""),
    (r) => String(r.id ?? "")
  );

  let total: number | undefined;
  if (opts.withTotal) {
    const n = await countOwnCommunityPosts(sb, uid, opts.status);
    if (n == null) return { ok: false, error: "posts_query_failed" };
    total = n;
  }

  if (page.items.length === 0) return { ok: true, posts: [], next_cursor: null, ...(total != null ? { total } : {}) };

  const nickMap = await fetchNicknamesForUserIds(sb as never, [uid]);
  const ids = page.items.map((r) => String(r.id));
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

  const posts = page.items.map((r): OwnCommunityPostDTO => {
    const dto = mapAuthorPostRow(r, uid, nickMap, thumbByPost);
    return {
      ...dto,
      isHiddenForOwner: !ownCommunityPostMatchesStatus(r, "active"),
      isImported: isCommunityImportedOrigin(r.origin_kind),
    };
  });
  return { ok: true, posts, next_cursor: page.next_cursor, ...(total != null ? { total } : {}) };
}

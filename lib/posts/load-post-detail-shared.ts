/**
 * GET /api/posts/[postId]/detail · `/post/[id]` RSC 상세 공통 조회.
 * 한 경로만 유지해 API·페이지 응답이 갈라지지 않게 함.
 */
import { maskTradeDetailBuyerFields } from "@/lib/posts/public-post-private-fields";
import { fetchPostRowForTradeChatById } from "@/lib/posts/fetch-post-row-for-trade-chat";
import {
  loadPostRowForDetail,
  mapPostDetailRowToPostWithMeta,
} from "@/lib/posts/map-post-detail-row";
import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { PostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import { fetchBlockedPairFromSb } from "@/lib/social/user-block-ssot";

export async function loadPostDetailShared(
  clients: PostsReadClients,
  postId: string,
  viewerUserId: string | null
): Promise<PostWithMeta | null> {
  const id = postId.trim();
  if (!id) return null;

  let row =
    (await loadPostRowForDetail(clients.readSb, POSTS_TABLE_READ, id)) ??
    (clients.serviceSb && clients.serviceSb !== clients.readSb
      ? await loadPostRowForDetail(clients.serviceSb, POSTS_TABLE_READ, id)
      : null) ??
    (clients.serviceSb ? await loadPostRowForDetail(clients.serviceSb, "posts", id) : null);

  if (!row) {
    const svc = resolveServiceSupabaseForApi();
    if (svc) {
      row = await fetchPostRowForTradeChatById(svc, id);
    }
  }

  if (!row) return null;
  if (!(await canViewTradePostDetailRow(row, viewerUserId))) return null;
  if (await isPostAuthorBlockedForViewer(row, viewerUserId)) return null;

  row = maskTradeDetailBuyerFields(row, viewerUserId);
  row = await withModerationStateForHiddenRow(row);

  const post = mapPostDetailRowToPostWithMeta(row);
  await enrichPostsAuthorNicknamesFromProfiles(clients.readSb, [post]);
  return post;
}

/** 목록과 같은 기준 — 양방향 차단 작성자의 글은 「없는 글」로 답한다(커뮤니티 상세 `blocked` 와 동일). */
export async function isPostAuthorBlockedForViewer(
  row: Record<string, unknown>,
  viewerUserId: string | null
): Promise<boolean> {
  const viewer = viewerUserId?.trim() ?? "";
  const authorId = String(row.user_id ?? row.author_id ?? "").trim();
  if (!viewer || !authorId || viewer === authorId) return false;
  try {
    return (await fetchBlockedPairFromSb(resolveServiceSupabaseForApi(), viewer, authorId)).blockedEitherWay;
  } catch {
    return false;
  }
}

/**
 * D-2: 숨김 글(작성자·관리자만 여기까지 온다)은 관리자 조치인지 알아야 안내·메뉴를 바꾼다.
 * 읽기 표(`posts_masked`)에는 `moderation_state` 가 없어 원본 표에서 1열만 읽는다(공개 글은 조회 없음).
 */
async function withModerationStateForHiddenRow(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (String(row.status ?? "").trim().toLowerCase() !== "hidden") return row;
  if (typeof row.moderation_state === "string") return row;
  const svc = resolveServiceSupabaseForApi();
  if (!svc) return row;
  try {
    const { data } = await svc.from(POSTS_TABLE_WRITE).select("moderation_state").eq("id", String(row.id ?? "")).maybeSingle();
    const m = (data as { moderation_state?: unknown } | null)?.moderation_state;
    return typeof m === "string" ? { ...row, moderation_state: m } : row;
  } catch {
    return row;
  }
}

/**
 * 공개 자격(목록계약 §1, 거래 계획 1단계 D-1): 숨김·삭제·관리자 숨김 거래 글은 `status=hidden`
 * (트리거가 owner_state·moderation_state 와 맞춘다). 상세는 서비스 권한으로 읽어 RLS 가 막지 못하므로
 * 여기서 작성자·관리자만 보게 한다. 그 외에는 「없는 글」로 답한다.
 */
async function canViewTradePostDetailRow(
  row: Record<string, unknown>,
  viewerUserId: string | null
): Promise<boolean> {
  if (!String(row.trade_category_id ?? "").trim()) return true;
  if (String(row.status ?? "").trim().toLowerCase() !== "hidden") return true;
  const viewer = viewerUserId?.trim() ?? "";
  if (!viewer) return false;
  if (String(row.user_id ?? "").trim() === viewer) return true;
  const svc = resolveServiceSupabaseForApi();
  if (!svc) return false;
  try {
    return await hasActiveAdminMembershipOrLegacyRole(svc, viewer);
  } catch {
    return false;
  }
}

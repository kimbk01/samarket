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
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { PostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";

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

  row = maskTradeDetailBuyerFields(row, viewerUserId);

  const post = mapPostDetailRowToPostWithMeta(row);
  await enrichPostsAuthorNicknamesFromProfiles(clients.readSb, [post]);
  return post;
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

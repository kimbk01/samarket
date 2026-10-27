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

  row = maskTradeDetailBuyerFields(row, viewerUserId);

  const post = mapPostDetailRowToPostWithMeta(row);
  await enrichPostsAuthorNicknamesFromProfiles(clients.readSb, [post]);
  return post;
}

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";
import { fetchBlockedAuthorIdsForViewer } from "@/lib/neighborhood/social-filter";
import { getNeighborhoodPostDetail } from "@/lib/neighborhood/queries";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";

export type CommunityPostAccessReason =
  | "ok"
  | "not_found"
  | "deleted"
  | "private"
  | "blocked"
  | "login_required";

export type CommunityPostDetailAccess = {
  reason: CommunityPostAccessReason;
  post: NeighborhoodFeedPostDTO | null;
};

async function fetchPostVisibilityRow(postId: string) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return null;
  }
  const { data } = await sb
    .from("community_posts")
    .select("id, user_id, status, is_deleted, is_hidden")
    .eq("id", postId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function resolveCommunityPostDetailAccess(
  postId: string,
  viewerUserId?: string | null
): Promise<CommunityPostDetailAccess> {
  const id = postId.trim();
  if (!id) return { reason: "not_found", post: null };

  const v = viewerUserId?.trim() ?? "";
  const post = await getNeighborhoodPostDetail(id, { viewerUserId: v || null });
  if (post) return { reason: "ok", post };

  const row = await fetchPostVisibilityRow(id);
  if (!row) return { reason: "not_found", post: null };

  const authorId = String(row.user_id ?? "");
  const deleted = row.is_deleted === true;
  const hidden = row.is_hidden === true;
  const status = String(row.status ?? "");
  const publiclyVisible = isCommunityPostPubliclyVisible(row as never);

  if (deleted) return { reason: "deleted", post: null };
  if (hidden || !publiclyVisible) {
    if (!v) return { reason: "login_required", post: null };
    if (authorId && v === authorId) {
      const own = await getNeighborhoodPostDetail(id, { viewerUserId: v });
      if (own) return { reason: "ok", post: own };
    }
    return { reason: "private", post: null };
  }

  if (v && authorId) {
    const blocked = await fetchBlockedAuthorIdsForViewer(getSupabaseServer(), v);
    if (blocked.has(authorId)) return { reason: "blocked", post: null };
  }

  return { reason: "not_found", post: null };
}

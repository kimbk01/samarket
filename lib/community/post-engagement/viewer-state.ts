import type { SupabaseClient } from "@supabase/supabase-js";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";
import {
  EMPTY_COMMUNITY_POST_VIEWER_STATE,
  type CommunityPostViewerState,
} from "./types";

function isMissingTableError(message: string, table: string): boolean {
  const m = message.toLowerCase();
  return m.includes(table.toLowerCase()) && m.includes("does not exist");
}

/** 로그인 viewer — 게시글 ID 배치 viewer 상태 */
export async function fetchCommunityPostViewerStatesBatch(
  sb: SupabaseClient,
  viewerUserId: string,
  postIds: string[],
  authorIdByPostId?: Map<string, string>
): Promise<Map<string, CommunityPostViewerState>> {
  const out = new Map<string, CommunityPostViewerState>();
  const ids = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
  if (!viewerUserId.trim() || ids.length === 0) return out;

  const uid = viewerUserId.trim();
  const defaultState = (): CommunityPostViewerState => ({ ...EMPTY_COMMUNITY_POST_VIEWER_STATE });

  const [likesRes, savesRes, hidesRes, reportsRes, followsRes, blocksRes] = await Promise.all([
    sb.from("community_post_likes").select("post_id").eq("user_id", uid).in("post_id", ids),
    sb.from("community_post_saves").select("post_id").eq("user_id", uid).in("post_id", ids),
    sb.from("community_post_hides").select("post_id").eq("user_id", uid).in("post_id", ids),
    sb
      .from("community_reports")
      .select("target_id")
      .eq("reporter_id", uid)
      .eq("target_type", "post")
      .in("target_id", ids),
    authorIdByPostId
      ? sb
          .from("user_relationships")
          .select("target_user_id")
          .eq("user_id", uid)
          .or("relation_type.eq.neighbor_follow,type.eq.neighbor_follow")
          .in(
            "target_user_id",
            [...new Set([...authorIdByPostId.values()].filter(Boolean))]
          )
      : Promise.resolve({ data: [], error: null }),
    authorIdByPostId
      ? Promise.resolve({ data: null, error: null })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const liked = new Set<string>();
  const saved = new Set<string>();
  const hidden = new Set<string>();
  const reported = new Set<string>();
  const following = new Set<string>();

  if (!likesRes.error || isMissingTableError(likesRes.error.message ?? "", "community_post_likes")) {
    for (const row of (likesRes.data ?? []) as Array<{ post_id?: string }>) {
      const pid = String(row.post_id ?? "").trim();
      if (pid) liked.add(pid);
    }
  }
  if (!savesRes.error || isMissingTableError(savesRes.error.message ?? "", "community_post_saves")) {
    for (const row of (savesRes.data ?? []) as Array<{ post_id?: string }>) {
      const pid = String(row.post_id ?? "").trim();
      if (pid) saved.add(pid);
    }
  }
  if (!hidesRes.error || isMissingTableError(hidesRes.error.message ?? "", "community_post_hides")) {
    for (const row of (hidesRes.data ?? []) as Array<{ post_id?: string }>) {
      const pid = String(row.post_id ?? "").trim();
      if (pid) hidden.add(pid);
    }
  }
  if (!reportsRes.error || isMissingTableError(reportsRes.error.message ?? "", "community_reports")) {
    for (const row of (reportsRes.data ?? []) as Array<{ target_id?: string }>) {
      const pid = String(row.target_id ?? "").trim();
      if (pid) reported.add(pid);
    }
  }
  if (authorIdByPostId && (!followsRes.error || followsRes.error === null)) {
    for (const row of (followsRes.data ?? []) as Array<{ target_user_id?: string }>) {
      const aid = String(row.target_user_id ?? "").trim();
      if (aid) following.add(aid);
    }
  }

  const blockedAuthors = new Set<string>();
  if (authorIdByPostId) {
    const authorIds = [...new Set([...authorIdByPostId.values()].filter(Boolean))];
    await Promise.all(
      authorIds.map(async (authorId) => {
        if (await isBlockedEitherWay(uid, authorId)) blockedAuthors.add(authorId);
      })
    );
  }

  for (const pid of ids) {
    const authorId = authorIdByPostId?.get(pid) ?? "";
    out.set(pid, {
      liked_by_viewer: liked.has(pid),
      saved_by_viewer: saved.has(pid),
      hidden_by_viewer: hidden.has(pid),
      following_author: authorId ? following.has(authorId) : false,
      blocked_author: authorId ? blockedAuthors.has(authorId) : false,
      reported_by_viewer: reported.has(pid),
    });
  }

  for (const pid of ids) {
    if (!out.has(pid)) out.set(pid, defaultState());
  }

  return out;
}

export async function fetchCommunityPostViewerState(
  sb: SupabaseClient,
  viewerUserId: string,
  postId: string,
  authorId: string
): Promise<CommunityPostViewerState> {
  const map = await fetchCommunityPostViewerStatesBatch(
    sb,
    viewerUserId,
    [postId],
    new Map([[postId, authorId]])
  );
  return map.get(postId) ?? { ...EMPTY_COMMUNITY_POST_VIEWER_STATE };
}

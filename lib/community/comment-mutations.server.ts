import {
  communityAcceptanceErrorCode,
  evaluateCommunityContentAcceptance,
} from "@/lib/community-points/content-acceptance";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isCommunityCommentPubliclyVisible } from "@/lib/community-engine/visibility";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";
import { getCommunityFeedOps } from "@/lib/community-feed/community-ops-settings";
import { guardBannedWords } from "@/lib/community-feed/banned-word-guard.server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";

type Sb = ReturnType<typeof getSupabaseServer>;

/**
 * `community_comment_likes` 삽입/삭제 + `community_comments.like_count` 수동 보정(트리거 없음)
 */
export async function toggleCommentLikeServer(
  postId: string,
  commentId: string,
  userId: string
): Promise<{ ok: true; liked: boolean; like_count: number } | { ok: false; error: string; code?: string }> {
  const pid = (await resolveCanonicalCommunityPostId(postId))?.trim() ?? "";
  const cid = commentId?.trim() ?? "";
  const uid = userId?.trim() ?? "";
  if (!pid || !cid || !uid) {
    return { ok: false, error: "invalid_request" };
  }

  const sb: Sb = getSupabaseServer();
  const { data: cRow, error: cErr } = await sb
    .from("community_comments")
    .select("id, post_id, like_count, status, is_hidden, is_deleted, user_id")
    .eq("id", cid)
    .eq("post_id", pid)
    .maybeSingle();
  const cr = cRow as
    | {
        id?: string;
        like_count?: number;
        post_id?: string;
        user_id?: string;
      }
    | null;
  if (cErr || !cr?.id) {
    return { ok: false, error: "comment_not_found" };
  }
  if (!isCommunityCommentPubliclyVisible(cRow as never)) {
    return { ok: false, error: "comment_not_likeable" };
  }
  const authorId = String(cr.user_id ?? "").trim();
  if (authorId && authorId !== uid && (await isBlockedEitherWay(uid, authorId))) {
    return {
      ok: false,
      error: "community_like_blocked_relation",
      code: "community_like_blocked_relation",
    };
  }

  const { data: ex } = await sb
    .from("community_comment_likes")
    .select("id")
    .eq("comment_id", cid)
    .eq("user_id", uid)
    .maybeSingle();
  if (ex) {
    const { data: before } = await sb.from("community_comments").select("like_count").eq("id", cid).maybeSingle();
    const cur0 = Math.max(0, Number((before as { like_count?: number } | null)?.like_count) || 0);
    const { error: delE } = await sb.from("community_comment_likes").delete().eq("id", (ex as { id: string }).id);
    if (delE) {
      return { ok: false, error: "like_remove_failed" };
    }
    const next0 = Math.max(0, cur0 - 1);
    const { data: after } = await sb
      .from("community_comments")
      .update({ like_count: next0 } as never)
      .eq("id", cid)
      .select("like_count")
      .maybeSingle();
    return { ok: true, liked: false, like_count: Math.max(0, Number((after as { like_count?: number } | null)?.like_count) || next0) };
  }

  const { data: beforeIns } = await sb.from("community_comments").select("like_count").eq("id", cid).maybeSingle();
  const cur1 = Math.max(0, Number((beforeIns as { like_count?: number } | null)?.like_count) || 0);
  const { error: insE } = await sb.from("community_comment_likes").insert({ comment_id: cid, user_id: uid });
  if (insE) {
    if (String(insE.code) === "23505") {
      const { data: row } = await sb
        .from("community_comments")
        .select("like_count")
        .eq("id", cid)
        .maybeSingle();
      return { ok: true, liked: true, like_count: Math.max(0, Number((row as { like_count?: number } | null)?.like_count) || 0) };
    }
    return { ok: false, error: "like_save_failed" };
  }
  const next1 = cur1 + 1;
  const { data: up } = await sb
    .from("community_comments")
    .update({ like_count: next1 } as never)
    .eq("id", cid)
    .select("like_count")
    .maybeSingle();
  return { ok: true, liked: true, like_count: Math.max(0, Number((up as { like_count?: number } | null)?.like_count) || next1) };
}

/**
 * 실패는 코드만(`error`) + 값은 `params` — 문구는 화면이 `COMMUNITY_COMMENT_ERROR_KEYS` 로 고른다 (재감사 2026-11-27).
 */
export type CommentMutationError = { ok: false; error: string; params?: Record<string, number | string> };

export async function updateCommentContentServer(
  postId: string,
  commentId: string,
  userId: string,
  content: string
): Promise<{ ok: true } | CommentMutationError> {
  const t = content?.trim() ?? "";
  if (!t) return { ok: false, error: "content_required" };
  const accepted = evaluateCommunityContentAcceptance(t, "comment");
  if (!accepted.ok) {
    return { ok: false, error: communityAcceptanceErrorCode(accepted.code) };
  }
  const ops = await getCommunityFeedOps();
  if (t.length > ops.max_comment_length) {
    return { ok: false, error: "comment_too_long", params: { max: ops.max_comment_length } };
  }
  const filtered = await guardBannedWords({
    userId,
    surface: "community_comment",
    texts: [t],
    operatorWords: ops.banned_words,
  });
  if (!filtered.ok) return { ok: false, error: filtered.code };

  const pid = (await resolveCanonicalCommunityPostId(postId))?.trim() ?? "";
  const cid = commentId?.trim() ?? "";
  const uid = userId?.trim() ?? "";
  if (!pid || !cid || !uid) {
    return { ok: false, error: "bad_request" };
  }
  const sb: Sb = getSupabaseServer();
  const { data: cRow, error: cErr } = await sb
    .from("community_comments")
    .select("id, post_id, user_id, status, is_hidden, is_deleted")
    .eq("id", cid)
    .eq("post_id", pid)
    .eq("user_id", uid)
    .maybeSingle();
  if (cErr || !cRow || !isCommunityCommentPubliclyVisible(cRow as never)) {
    return { ok: false, error: "comment_not_found" };
  }
  const { error: uErr } = await sb
    .from("community_comments")
    .update({ content: t, updated_at: new Date().toISOString() } as never)
    .eq("id", cid);
  if (uErr) {
    console.error("[comment-mutations] update failed", uErr.message);
    return { ok: false, error: "comment_save_failed" };
  }
  return { ok: true };
}

export async function deleteCommentForAuthorServer(
  postId: string,
  commentId: string,
  userId: string
): Promise<{ ok: true } | CommentMutationError> {
  const pid = (await resolveCanonicalCommunityPostId(postId))?.trim() ?? "";
  const cid = commentId?.trim() ?? "";
  const uid = userId?.trim() ?? "";
  if (!pid || !cid || !uid) {
    return { ok: false, error: "bad_request" };
  }
  const sb: Sb = getSupabaseServer();
  const { data: cRow, error: cErr } = await sb
    .from("community_comments")
    .select("id, post_id, user_id, status, is_hidden, is_deleted")
    .eq("id", cid)
    .eq("post_id", pid)
    .eq("user_id", uid)
    .maybeSingle();
  if (cErr || !cRow) {
    return { ok: false, error: "comment_not_found" };
  }
  /** 관리자가 숨긴 댓글·이미 삭제된 댓글은 작성자 삭제로 덮어쓰지 않는다 (CM-R-02) */
  if (!isCommunityCommentPubliclyVisible(cRow as never)) {
    return { ok: false, error: "comment_not_deletable" };
  }
  const { data: changed, error: uErr } = await sb
    .from("community_comments")
    .update({ status: "deleted" } as never)
    .eq("id", cid)
    .eq("status", "active")
    .select("id");
  if (uErr) {
    console.error("[comment-mutations] delete failed", uErr.message);
    return { ok: false, error: "comment_delete_failed" };
  }
  if (!changed || (changed as unknown[]).length === 0) return { ok: false, error: "comment_not_deletable" };
  return { ok: true };
}

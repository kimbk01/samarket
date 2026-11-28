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
 * 댓글 공감 = 「원하는 상태」 저장 (토글 아님 · 재시도해도 같은 결과).
 * 수 계산은 DB RPC `community_comment_like_set` 이 댓글 행을 잠그고 다시 센다 (감사 L6 · CM-P3-04).
 */
export async function setCommentLikeServer(
  postId: string,
  commentId: string,
  userId: string,
  liked: boolean
): Promise<{ ok: true; liked: boolean; like_count: number } | { ok: false; error: string; code?: string }> {
  const pid = (await resolveCanonicalCommunityPostId(postId))?.trim() ?? "";
  const cid = commentId?.trim() ?? "";
  const uid = userId?.trim() ?? "";
  if (!pid || !cid || !uid) {
    return { ok: false, error: "invalid_request", code: "invalid_request" };
  }

  const sb: Sb = getSupabaseServer();
  const { data: cRow, error: cErr } = await sb
    .from("community_comments")
    .select("id, post_id, status, is_hidden, is_deleted, user_id")
    .eq("id", cid)
    .eq("post_id", pid)
    .maybeSingle();
  const cr = cRow as { id?: string; user_id?: string } | null;
  if (cErr || !cr?.id) {
    return { ok: false, error: "comment_not_found", code: "comment_not_found" };
  }
  if (liked && !isCommunityCommentPubliclyVisible(cRow as never)) {
    return { ok: false, error: "comment_not_likeable", code: "comment_not_likeable" };
  }
  const authorId = String(cr.user_id ?? "").trim();
  if (liked && authorId && authorId !== uid && (await isBlockedEitherWay(uid, authorId))) {
    return {
      ok: false,
      error: "community_like_blocked_relation",
      code: "community_like_blocked_relation",
    };
  }

  const { data, error } = await sb.rpc("community_comment_like_set", {
    p_comment_id: cid,
    p_user_id: uid,
    p_liked: liked,
  });
  const out = (data ?? {}) as { ok?: boolean; error?: string; liked?: boolean; like_count?: number };
  if (error || out.ok !== true) {
    if (error) console.error("[comment-mutations] like rpc failed", error.message);
    const code = out.error && /^[a-z_]+$/.test(out.error) ? out.error : "like_save_failed";
    return { ok: false, error: code, code };
  }
  return { ok: true, liked: out.liked === true, like_count: Math.max(0, Number(out.like_count) || 0) };
}

/**
 * 댓글 고정·해제 — 글 작성자만, 글마다 1개 (Owner 결정 1 · DB RPC `community_comment_pin_set`).
 * 지워지거나 숨겨진 댓글은 DB 트리거가 고정을 푼다.
 */
export async function setCommentPinServer(
  postId: string,
  commentId: string,
  userId: string,
  pinned: boolean
): Promise<{ ok: true; pinned: boolean } | CommentMutationError> {
  const pid = (await resolveCanonicalCommunityPostId(postId))?.trim() ?? "";
  const cid = commentId?.trim() ?? "";
  const uid = userId?.trim() ?? "";
  if (!pid || !cid || !uid) return { ok: false, error: "bad_request" };
  const sb: Sb = getSupabaseServer();
  const { data: cRow } = await sb.from("community_comments").select("id").eq("id", cid).eq("post_id", pid).maybeSingle();
  if (!(cRow as { id?: string } | null)?.id) return { ok: false, error: "comment_not_found" };
  const { data, error } = await sb.rpc("community_comment_pin_set", {
    p_comment_id: cid,
    p_actor_id: uid,
    p_pinned: pinned,
  });
  const out = (data ?? {}) as { ok?: boolean; error?: string; pinned?: boolean };
  if (error || out.ok !== true) {
    if (error) console.error("[comment-mutations] pin rpc failed", error.message);
    const code = out.error && /^[a-z_]+$/.test(out.error) ? out.error : "comment_pin_failed";
    return { ok: false, error: code };
  }
  return { ok: true, pinned: out.pinned === true };
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
    /** `edited_at` = 작성자 본문 수정 시각 — 「수정됨」은 이 칸만 본다 (관리자 처리는 `updated_at` 만 · 감사 L5) */
    .update({ content: t, updated_at: new Date().toISOString(), edited_at: new Date().toISOString() } as never)
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
    /**
     * 작성자 삭제 = `moderated_by` 없음 — 앱·콘솔이 「작성자 삭제」로 판정하는 단일 기준 (설계 §6.2·§6.7).
     * 예전에 관리자가 숨겼다가 복구한 댓글이어도 지금 지운 사람은 작성자다. 관리자 처리 이력은 감사 기록(audit_logs)에 남는다.
     */
    .update({ status: "deleted", moderated_by: null, moderated_at: null, moderation_reason: null } as never)
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

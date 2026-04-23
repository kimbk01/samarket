import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isCommunityCommentPubliclyVisible } from "@/lib/community-engine/visibility";
import {
  findBannedWord,
  getCommunityFeedOps,
} from "@/lib/community-feed/community-ops-settings";
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
    return { ok: false, error: "요청이 올바르지 않습니다." };
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
      }
    | null;
  if (cErr || !cr?.id) {
    return { ok: false, error: "댓글을 찾을 수 없어요." };
  }
  if (!isCommunityCommentPubliclyVisible(cRow as never)) {
    return { ok: false, error: "댓글에 공감할 수 없어요." };
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
      return { ok: false, error: "공감 취소에 실패했어요." };
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
    return { ok: false, error: "공감 저장에 실패했어요." };
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

export async function updateCommentContentServer(
  postId: string,
  commentId: string,
  userId: string,
  content: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = content?.trim() ?? "";
  if (!t) return { ok: false, error: "내용을 입력하세요." };
  const ops = await getCommunityFeedOps();
  if (t.length > ops.max_comment_length) {
    return { ok: false, error: `댓글은 ${ops.max_comment_length}자 이하로 입력하세요.` };
  }
  if (findBannedWord(t, ops.banned_words)) {
    return { ok: false, error: "금칙어가 포함되어 있습니다." };
  }

  const pid = (await resolveCanonicalCommunityPostId(postId))?.trim() ?? "";
  const cid = commentId?.trim() ?? "";
  const uid = userId?.trim() ?? "";
  if (!pid || !cid || !uid) {
    return { ok: false, error: "요청이 올바르지 않습니다." };
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
    return { ok: false, error: "댓글을 찾을 수 없어요." };
  }
  const { error: uErr } = await sb
    .from("community_comments")
    .update({ content: t, updated_at: new Date().toISOString() } as never)
    .eq("id", cid);
  if (uErr) return { ok: false, error: "댓글 저장에 실패했어요." };
  return { ok: true };
}

export async function deleteCommentForAuthorServer(
  postId: string,
  commentId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pid = (await resolveCanonicalCommunityPostId(postId))?.trim() ?? "";
  const cid = commentId?.trim() ?? "";
  const uid = userId?.trim() ?? "";
  if (!pid || !cid || !uid) {
    return { ok: false, error: "요청이 올바르지 않습니다." };
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
    return { ok: false, error: "댓글을 찾을 수 없어요." };
  }
  const { error: uErr } = await sb
    .from("community_comments")
    .update({ status: "deleted" } as never)
    .eq("id", cid);
  if (uErr) return { ok: false, error: "댓글 삭제에 실패했어요." };
  return { ok: true };
}

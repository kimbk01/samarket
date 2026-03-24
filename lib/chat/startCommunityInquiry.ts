"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";

export type StartCommunityInquiryResult =
  | { ok: true; roomId: string }
  | { ok: false; error: string };

/**
 * 커뮤니티 게시글 맥락 1:1 문의 — POST /api/chat/community/start
 * @param commentId 댓글 맥락(선택). 있으면 참여자는 글 작성자·댓글 작성자만 허용
 */
export async function startCommunityInquiry(
  postId: string,
  peerUserId: string,
  commentId?: string | null
): Promise<StartCommunityInquiryResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };
  if (!postId.trim() || !peerUserId.trim()) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  try {
    const body: Record<string, string> = {
      postId: postId.trim(),
      peerUserId: peerUserId.trim(),
    };
    const c = commentId?.trim();
    if (c) body.commentId = c;
    const res = await fetch("/api/chat/community/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
    if (data.ok && data.roomId) return { ok: true, roomId: data.roomId };
    return { ok: false, error: data.error ?? "채팅방을 열 수 없습니다." };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "채팅방을 열 수 없습니다." };
  }
}

/** 글 작성자에게만 문의 (댓글 맥락 없음) */
export function startCommunityInquiryToAuthor(postId: string, authorUserId: string) {
  return startCommunityInquiry(postId, authorUserId, null);
}

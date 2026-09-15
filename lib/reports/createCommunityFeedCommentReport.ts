"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";

export type CreateCommunityFeedReportResult = { ok: true; id: string } | { ok: false; error: string };

/** Community 댓글/답글 신고 — community_reports (target_type=comment). 레거시 /api/reports 금지. */
export async function createCommunityFeedCommentReport(
  commentId: string,
  reason: string
): Promise<CreateCommunityFeedReportResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  const text = reason?.trim();
  if (!text) return { ok: false, error: "신고 사유를 입력해 주세요." };
  const cid = commentId?.trim();
  if (!cid) return { ok: false, error: "댓글을 찾을 수 없습니다." };

  try {
    const res = await fetch("/api/community/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "comment",
        commentId: cid,
        reasonText: text,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `신고 접수에 실패했습니다. (${res.status})` };
    }
    return { ok: true, id: json.id ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "신고 접수에 실패했습니다." };
  }
}

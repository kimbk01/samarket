"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  reportClientFailure,
  reportClientFailureFromResponse,
  type ReportClientFailure,
} from "@/lib/reports/report-block-error-text";
import type { CommunityReportReasonCode } from "@/lib/reports/community-report-reasons";

/** 실패는 코드만 — 문구는 화면이 `reportErrorText` 로 고른다 (재감사 2026-11-27) */
export type CreateCommunityFeedReportResult = { ok: true; id: string } | ReportClientFailure;

/** Community 댓글/답글 신고 — community_reports (target_type=comment). 레거시 /api/reports 금지. */
export async function createCommunityFeedCommentReport(
  commentId: string,
  reasonCode: CommunityReportReasonCode,
  reasonText: string
): Promise<CreateCommunityFeedReportResult> {
  const user = getCurrentUser();
  if (!user?.id) return reportClientFailure("login_required");

  const text = reasonText?.trim() ?? "";
  if (reasonCode === "other" && !text) return reportClientFailure("report_reason_required");
  const cid = commentId?.trim();
  if (!cid) return reportClientFailure("comment_not_found");

  try {
    const res = await fetch("/api/community/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "comment",
        commentId: cid,
        reasonCode,
        reasonText: text,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string };
    if (!res.ok || !json.ok) {
      return reportClientFailureFromResponse(res.status, json);
    }
    return { ok: true, id: json.id ?? "" };
  } catch {
    return reportClientFailure("network_error");
  }
}

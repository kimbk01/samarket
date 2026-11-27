"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { inferReportReasonCode } from "@/lib/reports/report-reason-code";
import {
  reportClientFailure,
  reportClientFailureFromResponse,
  type ReportClientFailure,
} from "@/lib/reports/report-block-error-text";

/** 실패는 코드만 — 문구는 화면이 `reportErrorText` 로 고른다 (재감사 2026-11-27) */
export type CreateCommunityCommentReportResult = { ok: true; id: string } | ReportClientFailure;

/** 커뮤니티/공통 게시글 댓글 신고 — reports.target_type = comment */
export async function createCommunityCommentReport(
  commentId: string,
  reason: string
): Promise<CreateCommunityCommentReportResult> {
  const user = getCurrentUser();
  if (!user?.id) return reportClientFailure("login_required");

  const text = reason?.trim();
  if (!text) return reportClientFailure("report_reason_required");

  try {
    const reason_code = inferReportReasonCode(text);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "comment",
        targetId: commentId,
        reasonCode: reason_code,
        reasonText: text,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
    };

    if (!res.ok || !json.ok) {
      return reportClientFailureFromResponse(res.status, json);
    }
    return { ok: true, id: json.id ?? "" };
  } catch {
    return reportClientFailure("network_error");
  }
}

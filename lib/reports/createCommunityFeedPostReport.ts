"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  reportClientFailure,
  reportClientFailureFromResponse,
  type ReportClientFailure,
} from "@/lib/reports/report-block-error-text";

/** 실패는 코드만 — 문구는 화면이 `reportErrorText` 로 고른다 (재감사 2026-11-27) */
export type CreateCommunityFeedPostReportResult = { ok: true; id: string } | ReportClientFailure;

/** 피드 글 신고 — community_reports */
export async function createCommunityFeedPostReport(
  postId: string,
  reason: string
): Promise<CreateCommunityFeedPostReportResult> {
  const user = getCurrentUser();
  if (!user?.id) return reportClientFailure("login_required");

  const text = reason?.trim();
  if (!text) return reportClientFailure("report_reason_required");

  try {
    const res = await fetch("/api/community/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: postId.trim(), reasonText: text }),
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

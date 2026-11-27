"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { inferReportReasonCode } from "@/lib/reports/report-reason-code";
import {
  reportClientFailure,
  reportClientFailureFromResponse,
  type ReportClientFailure,
} from "@/lib/reports/report-block-error-text";

/** 실패는 코드만 — 문구는 화면이 `reportErrorText` 로 고른다 (재감사 2026-11-27) */
export type CreateReportResult = { ok: true; id: string; already: boolean } | ReportClientFailure;

/**
 * 게시글(post) 신고 — public.reports (통합 스키마)
 * target_type=product, target_id=post id, product_id=post id
 */
export async function createReport(
  postId: string,
  reason: string,
  /** 선택한 사유 코드 — 있으면 문구 추론 없이 그대로 저장 (TM-08) */
  reasonCode?: string,
  /** 사용자가 적은 상세 내용 — 있으면 사유 라벨 뒤에 붙여 저장 */
  detail?: string
): Promise<CreateReportResult> {
  const user = getCurrentUser();
  if (!user?.id) return reportClientFailure("login_required");

  const text = reason?.trim();
  if (!text) return reportClientFailure("report_reason_required");

  try {
    const reason_code = reasonCode?.trim() || inferReportReasonCode(text);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "product",
        targetId: postId,
        productId: postId,
        reasonCode: reason_code,
        reasonText: detail?.trim() ? `${text}\n${detail.trim()}` : text,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      already?: boolean;
    };

    if (!res.ok || !json.ok) {
      return reportClientFailureFromResponse(res.status, json);
    }
    return { ok: true, id: json.id ?? "", already: json.already === true };
  } catch {
    return reportClientFailure("network_error");
  }
}

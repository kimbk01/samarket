"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ReportTargetType } from "@/lib/types/trade-report";
import {
  reportClientFailure,
  reportClientFailureFromResponse,
  type ReportClientFailure,
} from "@/lib/reports/report-block-error-text";

/** 실패는 코드만 — 문구는 화면이 `reportErrorText` 로 고른다 (재감사 2026-11-27) */
export type SubmitReportResult = { ok: true; reportId: string } | ReportClientFailure;

export interface SubmitReportPayload {
  targetType: ReportTargetType;
  targetId: string;
  roomId?: string | null;
  productId?: string | null;
  reasonCode: string;
  reasonText?: string | null;
}

/**
 * 통합 신고 제출 (user/product/chat_room/chat_message)
 * - 중복 과다 신고 제한은 앱 레벨 또는 DB 제약으로 별도 구현 가능
 */
export async function submitReport(payload: SubmitReportPayload): Promise<SubmitReportResult> {
  const user = getCurrentUser();
  if (!user?.id) return reportClientFailure("login_required");

  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetType: payload.targetType,
      targetId: payload.targetId,
      roomId: payload.roomId ?? null,
      productId: payload.productId ?? null,
      reasonCode: payload.reasonCode,
      reasonText: payload.reasonText ?? null,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    id?: string;
  };

  if (!res.ok || !json.ok) {
    return reportClientFailureFromResponse(res.status, json);
  }
  return { ok: true, reportId: json.id ?? "" };
}

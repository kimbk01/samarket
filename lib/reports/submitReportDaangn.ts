"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ReportTargetType } from "@/lib/types/daangn";

export type SubmitReportResult = { ok: true; reportId: string } | { ok: false; error: string };

export interface SubmitReportPayload {
  targetType: ReportTargetType;
  targetId: string;
  roomId?: string | null;
  productId?: string | null;
  reasonCode: string;
  reasonText?: string | null;
}

/**
 * 당근형: 통합 신고 제출 (user/product/chat_room/chat_message)
 * - 중복 과다 신고 제한은 앱 레벨 또는 DB 제약으로 별도 구현 가능
 */
export async function submitReportDaangn(payload: SubmitReportPayload): Promise<SubmitReportResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

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
    error?: string;
  };

  if (!res.ok || !json.ok) {
    return {
      ok: false,
      error: json.error ?? `신고 접수에 실패했습니다. (${res.status})`,
    };
  }
  return { ok: true, reportId: json.id ?? "" };
}

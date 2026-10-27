"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { inferReportReasonCode } from "@/lib/reports/report-reason-code";

export type CreateReportResult = { ok: true; id: string; already: boolean } | { ok: false; error: string };

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
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  const text = reason?.trim();
  if (!text) return { ok: false, error: "신고 사유를 선택하거나 입력해 주세요." };

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
      error?: string;
    };

    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: json.error ?? `신고 접수에 실패했습니다. (${res.status})`,
      };
    }
    return { ok: true, id: json.id ?? "", already: json.already === true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "신고 접수에 실패했습니다." };
  }
}

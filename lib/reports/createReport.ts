"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { inferReportReasonCode } from "@/lib/reports/report-reason-code";

export type CreateReportResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * 게시글(post) 신고 — public.reports (통합 스키마)
 * target_type=product, target_id=post id, product_id=post id
 */
export async function createReport(
  postId: string,
  reason: string
): Promise<CreateReportResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  const text = reason?.trim();
  if (!text) return { ok: false, error: "신고 사유를 선택하거나 입력해 주세요." };

  try {
    const reason_code = inferReportReasonCode(text);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "product",
        targetId: postId,
        productId: postId,
        reasonCode: reason_code,
        reasonText: text,
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
    return { ok: true, id: json.id ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "신고 접수에 실패했습니다." };
  }
}

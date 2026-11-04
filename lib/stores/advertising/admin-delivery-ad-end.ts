/**
 * AL-04 · D-13 — 배달 광고 진행 중 관리자 종료 + 귀책별 비즈니스 캐시 비례 환급.
 * 돈 계산·원장·잔액·캠페인 종료·배달 감사 1행은 DB 함수 `admin_delivery_ad_end_with_refund` 한 트랜잭션에서만 한다
 * (TS 는 미리보기 값을 보여 줄 뿐 금액을 쓰지 않는다 · 원장 키 `delivery-ad-end-refund:<campaignId>`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const ADMIN_DELIVERY_AD_END_WITH_REFUND_RPC = "admin_delivery_ad_end_with_refund" as const;

export type DeliveryAdEndFault = "operator" | "member" | "none";

export const DELIVERY_AD_END_FAULTS: readonly DeliveryAdEndFault[] = ["operator", "member", "none"];

export function isDeliveryAdEndFault(v: unknown): v is DeliveryAdEndFault {
  return v === "operator" || v === "member" || v === "none";
}

/**
 * 진행 중 종료 = 귀책 + 비례 환급 함수로 종료하는 상태 (노출 중 · 사장님/관리자 정지 중).
 * 그 밖의 종료 가능 상태(예약 SCHEDULED)는 기존 전이 함수(`admin_delivery_ad_transition` end)를 쓴다.
 */
export const DELIVERY_AD_LIVE_END_LIFECYCLES = ["ACTIVE", "PAUSED_OWNER", "PAUSED_ADMIN"] as const;

export function isDeliveryAdLiveEndLifecycle(status: string | null | undefined): boolean {
  return (DELIVERY_AD_LIVE_END_LIFECYCLES as readonly string[]).includes(String(status ?? ""));
}

/** 귀책 라디오 문구 (배달 상세 · 공통 화면 같은 문구). */
export function deliveryAdEndFaultLabel(fault: DeliveryAdEndFault, ko: boolean): string {
  if (fault === "operator") return ko ? "운영 사유 — 남은 기간 비례 환급" : "Operator — prorated refund of remaining period";
  if (fault === "member") return ko ? "사장님 사유 — 환급 없음" : "Owner — no refund";
  return ko ? "해당 없음 — 환급 없음" : "Not applicable — no refund";
}

function httpStatusFor(error: string): number {
  if (error === "fault_required" || error === "reason_required") return 400;
  if (error === "already_ended") return 409;
  if (error === "not_found") return 404;
  if (error === "rpc_missing") return 503;
  return 400;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function adminEndDeliveryAdWithRefund(
  sb: SupabaseClient,
  input: {
    campaignId: string;
    adminUserId: string;
    fault: DeliveryAdEndFault;
    reason: string;
    preview?: boolean;
  }
): Promise<
  | { ok: true; preview: boolean; refundAmount: number; paidAmount: number; remainingSeconds: number }
  | { ok: false; error: string; httpStatus: number }
> {
  if (!isDeliveryAdEndFault(input.fault)) {
    return { ok: false, error: "fault_required", httpStatus: 400 };
  }
  const preview = input.preview === true;
  const reason = String(input.reason ?? "").trim();
  if (!preview && !reason) {
    return { ok: false, error: "reason_required", httpStatus: 400 };
  }

  const { data, error } = await sb.rpc(ADMIN_DELIVERY_AD_END_WITH_REFUND_RPC, {
    p_campaign_id: input.campaignId,
    p_admin_id: input.adminUserId,
    p_fault: input.fault,
    p_reason: reason,
    p_preview: preview,
  });
  if (error) {
    // DB 원문은 내보내지 않는다 — 함수 없음만 구분.
    const missing =
      error.code === "PGRST202" ||
      error.code === "42883" ||
      /could not find the function/i.test(String(error.message ?? ""));
    const code = missing ? "rpc_missing" : "rpc_failed";
    return { ok: false, error: code, httpStatus: missing ? 503 : 500 };
  }
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    const raw = typeof payload?.error === "string" ? payload.error : "";
    const code = /^[a-z_]{1,64}$/.test(raw) ? raw : "rpc_failed";
    return { ok: false, error: code, httpStatus: httpStatusFor(code) };
  }
  return {
    ok: true,
    preview: payload.preview === true,
    refundAmount: num(payload.refund_amount),
    paidAmount: num(payload.paid_amount),
    remainingSeconds: num(payload.remaining_seconds),
  };
}

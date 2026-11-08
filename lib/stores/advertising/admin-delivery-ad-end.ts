/**
 * AL-04 · D-13 — 배달 광고 진행 중 관리자 종료 + 귀책별 비즈니스 캐시 비례 환급.
 * 돈 계산·원장·잔액·캠페인 종료·배달 감사 1행은 DB 함수 `admin_delivery_ad_end_with_refund` 한 트랜잭션에서만 한다
 * (TS 는 미리보기 값을 보여 줄 뿐 금액을 쓰지 않는다 · 원장 키 `delivery-ad-end-refund:<campaignId>`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { translateBy } from "@/lib/i18n/translate-by";

export const ADMIN_DELIVERY_AD_END_WITH_REFUND_RPC = "admin_delivery_ad_end_with_refund" as const;

export type DeliveryAdEndFault = "operator" | "member" | "none";

export const DELIVERY_AD_END_FAULTS: readonly DeliveryAdEndFault[] = ["operator", "member", "none"];

export function isDeliveryAdEndFault(v: unknown): v is DeliveryAdEndFault {
  return v === "operator" || v === "member" || v === "none";
}

/**
 * 진행 중 종료 = 귀책 + 비례 환급 함수로 종료하는 상태 (노출 중 · 예약 · 사장님/관리자 정지 중).
 * D-02 (2026-11-07) — 예약(SCHEDULED)도 선결제가 있으므로 같은 함수로 간다 (DB 함수가 SCHEDULED 를 받는다 · 전액 비례).
 * 예전에는 SCHEDULED 가 빠져 환급 없는 `admin_delivery_ad_transition` end 로 갔다.
 */
export const DELIVERY_AD_LIVE_END_LIFECYCLES = ["ACTIVE", "SCHEDULED", "PAUSED_OWNER", "PAUSED_ADMIN"] as const;

export function isDeliveryAdLiveEndLifecycle(status: string | null | undefined): boolean {
  return (DELIVERY_AD_LIVE_END_LIFECYCLES as readonly string[]).includes(String(status ?? ""));
}

/** 귀책 라디오 문구 (배달 상세 · 공통 화면 같은 문구). */
export function deliveryAdEndFaultLabel(fault: DeliveryAdEndFault, ko: boolean): string {
  const lang = ko ? "ko" : "en";
  if (fault === "operator") return translateBy(lang, "stores_ad_end_fault_operator");
  if (fault === "member") return translateBy(lang, "stores_ad_end_fault_member");
  return translateBy(lang, "stores_ad_end_fault_none");
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

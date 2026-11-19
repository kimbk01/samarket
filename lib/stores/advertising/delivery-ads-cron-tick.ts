import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 광고 일정 전환 예약 작업 — 할 일 없는 실행을 DB 함수 1번으로 (2026-11-19 · Owner 「1번부터 승인」).
 * 설계: docs/audit/supabase-request-surge-2026-11-18/cron-due-tick-design-2026-11-19.md
 *
 * `delivery_ads_cron_tick`:
 *   - 광고 후보가 있으면 `schedule_due: true` 만 → 호출부가 지금과 같은 전체 경로(승격 → 정리 3개)를 돈다.
 *   - 후보가 없으면 정리 함수 3개(파트너 만료·쿠폰 종료·쿠폰 만료)를 DB 안에서 불러 결과를 돌려준다.
 * 함수가 없거나(마이그레이션 전) 오류면 `{ ok: false }` → 호출부가 지금과 같은 전체 경로로 처리한다.
 */
export const DELIVERY_ADS_CRON_TICK_RPC = "delivery_ads_cron_tick" as const;

export type StepResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export type DeliveryAdsCronTick =
  | { ok: true; scheduleDue: true }
  | {
      ok: true;
      scheduleDue: false;
      partner: StepResult<{ ended: number }>;
      couponAutoEnd: StepResult<{ ended: number }>;
      couponExpire: StepResult<{ expired: number; reservedReleased: number }>;
    }
  | { ok: false; error: string };

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** 앱 코드의 runPartnerMembershipExpiryBatch 와 같은 해석 */
export function parsePartnerExpiry(v: unknown): StepResult<{ ended: number }> {
  const p = obj(v);
  if (!p || p.ok !== true) return { ok: false, error: typeof p?.error === "string" ? p.error : "expire_failed" };
  return { ok: true, ended: Math.trunc(num(p.ended)) };
}

/** 앱 코드의 runStoreCouponAutoEndBatch 와 같은 해석 */
export function parseCouponAutoEnd(v: unknown): StepResult<{ ended: number }> {
  const p = obj(v);
  if (p && typeof p.error === "string") return { ok: false, error: p.error };
  return { ok: true, ended: num(p?.ended) };
}

/** 앱 코드의 runCouponEntitlementExpireBatch 와 같은 해석 */
export function parseCouponExpire(v: unknown): StepResult<{ expired: number; reservedReleased: number }> {
  const p = obj(v);
  if (p && typeof p.error === "string") return { ok: false, error: p.error };
  return { ok: true, expired: num(p?.expired_count), reservedReleased: num(p?.reserved_released) };
}

export async function runDeliveryAdsCronTick(sb: SupabaseClient): Promise<DeliveryAdsCronTick> {
  try {
    const { data, error } = await sb.rpc(DELIVERY_ADS_CRON_TICK_RPC, {
      p_partner_limit: 200,
      p_coupon_end_limit: 500,
      p_coupon_expire_limit: 500,
    });
    if (error) return { ok: false, error: error.message || "rpc_failed" };
    const p = obj(data);
    if (!p || p.ok !== true) return { ok: false, error: "tick_failed" };
    if (p.schedule_due === true) return { ok: true, scheduleDue: true };
    return {
      ok: true,
      scheduleDue: false,
      partner: parsePartnerExpiry(p.partner),
      couponAutoEnd: parseCouponAutoEnd(p.coupon_auto_end),
      couponExpire: parseCouponExpire(p.coupon_expire),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "rpc_threw" };
  }
}

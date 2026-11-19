import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 2026-11-19 예약 작업 4번 — 작업 하나의 단계를 DB 함수 1번으로(작업끼리 합치지 않음 · #477 되돌림 교훈).
 * 함수가 없거나 오류면 null → 호출부가 기존 경로로 처리한다.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/cron-due-tick-design-2026-11-19.md
 */

/** 주문 SLA 검사 + 하트비트(검사 성공 때만) — `store_orders_sla_scan_tick` */
export async function runStoreOrdersSlaScanTick(
  sb: SupabaseClient
): Promise<{ ok: true; heartbeatError: string | null } | { ok: false; error: string } | null> {
  try {
    const { data, error } = await sb.rpc("store_orders_sla_scan_tick", {});
    if (error) return null;
    const p = (data ?? null) as Record<string, unknown> | null;
    if (!p || p.v !== 1) return null;
    if (p.ok !== true) return { ok: false, error: typeof p.error === "string" ? p.error : "sla_scan_failed" };
    return { ok: true, heartbeatError: typeof p.heartbeat_error === "string" ? p.heartbeat_error : null };
  } catch {
    return null;
  }
}

/** 알림 캠페인: 첫 회차 확보 + (확보 없을 때) 반복 캠페인 다음 회차 필요 목록 — `notification_campaigns_cron_tick` */
export type NotificationCampaignsCronTick<Row> =
  | { claimed: Row; recurringMissing: null }
  | { claimed: null; recurringMissing: string[] };

export async function runNotificationCampaignsCronTick<Row>(
  sb: SupabaseClient,
  claimToken: string
): Promise<NotificationCampaignsCronTick<Row> | null> {
  try {
    const { data, error } = await sb.rpc("notification_campaigns_cron_tick", {
      p_claim_token: claimToken,
      p_lease_seconds: 600,
    });
    if (error) return null;
    const p = (data ?? null) as Record<string, unknown> | null;
    if (!p || p.ok !== true) return null;
    if (p.claimed && typeof p.claimed === "object") return { claimed: p.claimed as Row, recurringMissing: null };
    const ids = Array.isArray(p.recurring_missing) ? p.recurring_missing.map((x) => String(x)).filter(Boolean) : [];
    return { claimed: null, recurringMissing: ids };
  } catch {
    return null;
  }
}

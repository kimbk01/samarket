import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminNotificationCronPrefetch,
  OutboxRow,
  PushDeliveryRow,
} from "@/lib/admin/notifications/admin-notification-service";

/**
 * 2026-11-19 예약 작업 3번 — 관리자 알림 발송 작업의 첫 단계 4개(정산 예외 검사 · 원본 재생 · 대기열 확보 · 비었으면 푸시 확보)를
 * `admin_notification_cron_tick` 1번으로. 함수가 없거나 오류면 null → 호출부가 기존처럼 하나씩 부른다.
 */
export type AdminNotificationCronTick = {
  settlement: unknown;
  settlementError: string | null;
  prefetched: AdminNotificationCronPrefetch;
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export async function runAdminNotificationCronTick(
  sb: SupabaseClient,
  opts: { lookbackHours?: number; batch?: number } = {}
): Promise<AdminNotificationCronTick | null> {
  try {
    const { data, error } = await sb.rpc("admin_notification_cron_tick", {
      p_lookback: `${Math.min(Math.max(opts.lookbackHours ?? 72, 1), 24 * 14)} hours`,
      p_replay_limit: 200,
      p_batch: Math.min(Math.max(opts.batch ?? 20, 1), 100),
    });
    if (error) return null;
    const p = (data ?? null) as Record<string, unknown> | null;
    if (!p || p.ok !== true) return null;
    return {
      settlement: p.settlement ?? null,
      settlementError: str(p.settlement_error),
      prefetched: {
        replayed: p.replayed == null ? null : Number(p.replayed),
        replayError: str(p.replay_error),
        outbox: Array.isArray(p.outbox) ? (p.outbox as OutboxRow[]) : [],
        outboxError: str(p.outbox_error),
        push: Array.isArray(p.push) ? (p.push as PushDeliveryRow[]) : null,
        pushError: str(p.push_error),
      },
    };
  } catch {
    return null;
  }
}

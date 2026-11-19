import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { runAdminNotificationDeliveryWorker } from "@/lib/admin/notifications/admin-notification-service";
import { runAdminNotificationCronTick } from "@/lib/admin/notifications/admin-notification-cron-tick";
import { ADMIN_NOTIFICATION_RETENTION_DAYS } from "@/lib/admin/notifications/admin-notification-kinds";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R13-D ADMIN NOTIFICATION delivery owner (cron only — CRON_SECRET).
 *   0) settlement financial-exception scan (store_commission_enqueue_exception_notifications) → outbox
 *   1) source replay (support replies with no admin notification) → outbox
 *   2) outbox claim → idempotent re-create (UNIQUE(recipient, dedupe_key))
 *   3) push retries (authority re-verified; unknown outcomes never resent)
 *   4) 90-day archive — OFF unless ADMIN_NOTIFICATION_ARCHIVE_ENABLED=1 (separate approval)
 */
async function runAdminNotificationDelivery(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const cronSideEffectsBlocked = rejectCronIfSideEffectsBlocked();
  if (cronSideEffectsBlocked) return cronSideEffectsBlocked;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  // Settlement financial exceptions → outbox (idempotent per event) before the worker drains it.
  /**
   * 2026-11-19 예약 작업 3번 — 첫 단계 4개(정산 예외 검사 · 원본 재생 · 대기열 확보 · 비었으면 푸시 확보)를 함수 1번으로.
   * 함수가 없거나 오류면 null → 기존처럼 하나씩.
   */
  const tick = await runAdminNotificationCronTick(sb);
  if (!tick) console.warn("[cron admin-notification-delivery] tick_fallback");
  const settlementScan = tick
    ? { data: tick.settlement, error: tick.settlementError ? { message: tick.settlementError } : null }
    : await sb.rpc("store_commission_enqueue_exception_notifications");

  const summary = await runAdminNotificationDeliveryWorker(sb, {}, { prefetched: tick?.prefetched ?? null });
  if (settlementScan.error && !/could not find the function|does not exist/i.test(settlementScan.error.message)) {
    summary.errors.push(`settlement_scan:${settlementScan.error.message}`);
  }

  let archived: number | null = null;
  if (process.env.ADMIN_NOTIFICATION_ARCHIVE_ENABLED === "1") {
    const { data, error } = await sb.rpc("admin_notifications_archive_expired", {
      p_days: ADMIN_NOTIFICATION_RETENTION_DAYS,
    });
    if (error) summary.errors.push(`archive:${error.message}`);
    else archived = Number(data) || 0;
  }

  return NextResponse.json({ ok: summary.errors.length === 0, ...summary, archived, settlementScan: settlementScan.data ?? null });
}

export async function GET(req: Request) {
  return runAdminNotificationDelivery(req);
}

export async function POST(req: Request) {
  return runAdminNotificationDelivery(req);
}

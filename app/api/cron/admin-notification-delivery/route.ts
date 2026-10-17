import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { runAdminNotificationDeliveryWorker } from "@/lib/admin/notifications/admin-notification-service";
import { ADMIN_NOTIFICATION_RETENTION_DAYS } from "@/lib/admin/notifications/admin-notification-kinds";

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

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  // Settlement financial exceptions → outbox (idempotent per event) before the worker drains it.
  const settlementScan = await sb.rpc("store_commission_enqueue_exception_notifications");

  const summary = await runAdminNotificationDeliveryWorker(sb);
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

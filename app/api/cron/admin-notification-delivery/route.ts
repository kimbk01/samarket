import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  purgeDeliveredSupportOutbox,
  runAdminNotificationDeliveryWorker,
} from "@/lib/admin/notifications/admin-notification-service";
import { runAdminNotificationCronTick } from "@/lib/admin/notifications/admin-notification-cron-tick";
import { ADMIN_NOTIFICATION_RETENTION_DAYS } from "@/lib/admin/notifications/admin-notification-kinds";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import {
  autoCloseStaleAnsweredSupportCases,
  shouldRunSupportAutoClose,
} from "@/lib/support/support-case-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R13-D ADMIN NOTIFICATION delivery owner (cron only — CRON_SECRET).
 *   0) settlement financial-exception scan (store_commission_enqueue_exception_notifications) → outbox
 *   1) source replay (support replies with no admin notification) → outbox
 *   2) outbox claim → idempotent re-create (UNIQUE(recipient, dedupe_key))
 *   3) push retries (authority re-verified; unknown outcomes never resent)
 *   4) 90-day archive — OFF unless ADMIN_NOTIFICATION_ARCHIVE_ENABLED=1 (separate approval)
 *   5) 고객 문의 SSOT §2 (F7) — 답변 후 7일 고객 글 없는 문의 자동 종료(새 cron 없이 매시 첫 실행만).
 *   6) 고객 문의 최종 감사 L9 — 고객센터 발송 대기열 처리됨 행 30일 보관 뒤 삭제(매시 첫 실행만, 1회 최대 1000행).
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

  // 최종 감사 L14: 매시 첫 실행 판정은 **시작 시각**으로 — 대기열 작업이 길어져 UTC 분 5 를 넘겨도 그 시간 자동 종료를 건너뛰지 않는다.
  const hourlySupportRun = shouldRunSupportAutoClose(new Date());

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

  let supportAutoClosed: number | null = null;
  let supportOutboxPurged: number | null = null;
  if (hourlySupportRun) {
    const auto = await autoCloseStaleAnsweredSupportCases(sb);
    if (auto.ok) supportAutoClosed = auto.closed;
    else summary.errors.push(`support_auto_close:${auto.error}`);
    const purge = await purgeDeliveredSupportOutbox(sb);
    if (purge.ok) supportOutboxPurged = purge.deleted;
    else summary.errors.push(`support_outbox_purge:${purge.error}`);
  }

  const ok = summary.errors.length === 0;
  // 감사 2026-11-24 S9: 단계 실패(DB 호출 오류)도 200 이라 Vercel cron 이 실패로 기록하지 않았다 → 500.
  // 본문은 그대로 (어느 단계가 실패했는지). 개별 푸시 실패는 errors 에 들어가지 않는다(재시도·dead 로 관리).
  return NextResponse.json(
    { ok, ...summary, archived, supportAutoClosed, supportOutboxPurged, settlementScan: settlementScan.data ?? null },
    { status: ok ? 200 : 500 }
  );
}

export async function GET(req: Request) {
  return runAdminNotificationDelivery(req);
}

export async function POST(req: Request) {
  return runAdminNotificationDelivery(req);
}

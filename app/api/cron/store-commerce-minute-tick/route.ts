import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import {
  executeNotificationPushHandoff,
  executeStoreOrderAcceptReminders,
  executeStoreOrdersAcceptTimeout,
  probeStoreAcceptAutomationDue,
} from "@/lib/cron/store-commerce-minute-tick.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase C1 — 분당 1회.
 * 1) 채팅 푸시 인계(side-effect 게이트 밖 · 통화 규정)
 * 2) store 접수 자동화 — 게이트 통과 후 pending≥30s probe 없으면 스킵
 */
async function runStoreCommerceMinuteTick(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sbService = tryCreateSupabaseServiceClient();
  if (!sbService) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const push = await executeNotificationPushHandoff(sbService);

  const cronSideEffectsBlocked = rejectCronIfSideEffectsBlocked();
  if (cronSideEffectsBlocked) {
    return NextResponse.json({
      ok: true,
      push,
      store: { skipped: true as const, reason: "cron_side_effects_blocked" },
    });
  }

  const sbStores = tryGetSupabaseForStores();
  if (!sbStores) {
    return NextResponse.json({
      ok: true,
      push,
      store: { skipped: true as const, reason: "supabase_unconfigured" },
    });
  }

  const due = await probeStoreAcceptAutomationDue(sbStores);
  if (!due) {
    return NextResponse.json({
      ok: true,
      push,
      store: { skipped: true as const, reason: "no_due_pending" },
    });
  }

  const reminders = await executeStoreOrderAcceptReminders(sbStores);
  if (!reminders.ok) {
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(reminders.error), push },
      { status: 500 }
    );
  }
  const timeout = await executeStoreOrdersAcceptTimeout(sbStores, req);
  if (!timeout.ok) {
    console.error("[cron store-commerce-minute-tick timeout]", timeout.error);
    return NextResponse.json(
      {
        ok: false,
        error: clientSafeInternalErrorMessage(timeout.error),
        push,
        reminders,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    push,
    store: { skipped: false as const, reminders, timeout },
  });
}

export async function GET(req: Request) {
  return runStoreCommerceMinuteTick(req);
}

export async function POST(req: Request) {
  return runStoreCommerceMinuteTick(req);
}

import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { runStoreOrderAcceptRemindersJob } from "@/lib/stores/cron/store-order-accept-reminders-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 사장님 접수 독촉 — 수동 실행 경로. 본문은 `lib/stores/cron/store-order-accept-reminders-job.ts`.
 * 2026-11-26 부터 예약 실행은 `/api/cron/store-orders-minute-tick` 이 같은 함수를 부른다(vercel.json).
 */
async function runReminders(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const cronSideEffectsBlocked = rejectCronIfSideEffectsBlocked();
  if (cronSideEffectsBlocked) return cronSideEffectsBlocked;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const result = await runStoreOrderAcceptRemindersJob(sb);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}

export async function GET(req: Request) {
  return runReminders(req);
}

export async function POST(req: Request) {
  return runReminders(req);
}

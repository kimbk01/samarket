import { NextResponse } from "next/server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { executeStoreOrdersAcceptTimeout } from "@/lib/cron/store-commerce-minute-tick.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 수동/디버그용 — Vercel cron 은 store-commerce-minute-tick 으로 통합(C1). */
async function runStoreOrdersAcceptTimeout(req: Request) {
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

  const result = await executeStoreOrdersAcceptTimeout(sb, req);
  if (!result.ok) {
    console.error("[cron store-orders-accept-timeout]", result.error);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(result.error) },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, cancelled: result.cancelled, order_ids: result.order_ids });
}

export async function GET(req: Request) {
  return runStoreOrdersAcceptTimeout(req);
}

export async function POST(req: Request) {
  return runStoreOrdersAcceptTimeout(req);
}

import { NextResponse } from "next/server";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { executeNotificationPushHandoff } from "@/lib/cron/store-commerce-minute-tick.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 수동/디버그용 — Vercel cron 은 store-commerce-minute-tick 으로 통합(C1).
 * side-effect 게이트 없음(통화·채팅 푸시 인계 · CALL_DOMAIN_EXCLUDED).
 */
async function runNotificationPushHandoff(req: Request) {
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

  const result = await executeNotificationPushHandoff(sb);
  return NextResponse.json(result);
}

export async function GET(req: Request) {
  return runNotificationPushHandoff(req);
}

export async function POST(req: Request) {
  return runNotificationPushHandoff(req);
}

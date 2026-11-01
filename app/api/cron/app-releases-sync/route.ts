import { NextResponse } from "next/server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { syncAppReleases } from "@/lib/app-releases/app-release-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 앱 출시 기록 자동 수집 + 업데이트 안내 알림 (앱 업데이트 v2 · Owner 승인 2026-11-01) — 1시간마다.
 * Google Play(키 있을 때) · App Store 공개 조회 · 기기 보고 버전 → app_releases → 구버전 회원에게만 알림.
 */
async function run(req: Request) {
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
  try {
    const result = await syncAppReleases(sb);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron app-releases-sync]", err);
    return NextResponse.json({ ok: false, error: clientSafeInternalErrorMessage(String(err)) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

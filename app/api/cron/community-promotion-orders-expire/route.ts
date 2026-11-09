import { NextResponse } from "next/server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 커뮤니티 상위노출 만료 (광고 ② D-9 · Owner 2026-11-04 「설계안대로 구현」).
 * 거래 `trade-promotion-orders-expire` 와 같은 구조·같은 인증 — Vercel cron 이 10분마다
 * `community_promotion_orders_expire()` 를 호출한다 (기간이 지난 `active` → `expired`, 환급 없음).
 */
async function runCommunityPromotionExpire(req: Request) {
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
  try {
    const { data, error } = await sb.rpc("community_promotion_orders_expire");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, ...((data ?? {}) as Record<string, unknown>) });
  } catch (err) {
    console.error("[cron community-promotion-orders-expire]", err);
    return NextResponse.json({ ok: false, error: clientSafeInternalErrorMessage(String(err)) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runCommunityPromotionExpire(req);
}

export async function POST(req: Request) {
  return runCommunityPromotionExpire(req);
}

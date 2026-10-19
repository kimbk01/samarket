import { NextResponse } from "next/server";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 거래 홍보 만료 (거래 Admin 설계 v2 §G-1 · D-07).
 * 운영 DB 에 pg_cron 이 없어 기존 만료 함수가 실행되지 않던 문제 → Vercel cron 이 10분마다
 * `expire_trade_promotion_orders()` 를 호출한다 (행마다 잠금·조건·감사, 커뮤니티 주문은 건드리지 않음).
 */
async function runTradePromotionExpire(req: Request) {
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
    const { data, error } = await sb.rpc("expire_trade_promotion_orders");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, ...((data ?? {}) as Record<string, unknown>) });
  } catch (err) {
    console.error("[cron trade-promotion-orders-expire]", err);
    return NextResponse.json({ ok: false, error: clientSafeInternalErrorMessage(String(err)) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runTradePromotionExpire(req);
}

export async function POST(req: Request) {
  return runTradePromotionExpire(req);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/my/trade-performance (세션) — 판매 탭 성과(조회수·찜·신고), 거래 E (Owner 2026-10-28).
 * 읽기 전용. 계산은 `loadMyTradePerformanceServer` 한 곳.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadMyTradePerformanceServer } from "@/lib/my/load-my-trade-performance-server";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  const loaded = await loadMyTradePerformanceServer(
    sb as import("@supabase/supabase-js").SupabaseClient<any>,
    auth.userId
  );
  if (!loaded.ok) return NextResponse.json({ ok: false, error: "trade_performance_load_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, ...loaded.performance });
}

/**
 * GET /api/me/crew-rep — 내 CREW REP 상세 (S6, 설계 §4.7): 점수·축·90일 점수 이력·반영된 기록.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { loadCrewRepMemberDetail } from "@/lib/trust/crew-rep-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = getTradeServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  try {
    const detail = await loadCrewRepMemberDetail(sb as never, auth.userId);
    return NextResponse.json({ ok: true, ...detail }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[me crew-rep]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

/**
 * GET /api/users/:userId/crew-rep — 상대 회원 CREW REP 공개 요약 (S6, 설계 §4.6).
 * 점수·축·거래 평가 집계·약속 요약만. 개별 내역·날짜·평가자는 내보내지 않는다. 로그인 회원만.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { loadCrewRepPublicSummary } from "@/lib/trust/crew-rep-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { userId } = await ctx.params;
  const memberId = userId?.trim();
  if (!memberId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const sb = getTradeServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  try {
    const summary = await loadCrewRepPublicSummary(sb as never, memberId);
    return NextResponse.json({ ok: true, ...summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[user crew-rep]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

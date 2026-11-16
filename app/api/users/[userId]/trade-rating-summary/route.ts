/**
 * 판매자(회원) 거래 평가 공개 집계 — CREW REP S5 (설계 §4.6·§7.6).
 * 최근 365일 공개된 평가만 · 평가자·날짜·남길 말은 내보내지 않는다. 로그인 회원만.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { loadTradeRatingSummary } from "@/lib/trade/trade-rating";

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
    const summary = await loadTradeRatingSummary(sb as never, memberId);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    console.error("[trade rating summary]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

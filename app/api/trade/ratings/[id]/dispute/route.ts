/**
 * 받은 「아쉬워요」 이의제기 — CREW REP S5 (설계 §7.5). 공개 후 14일 안 1회, 검토 중에는 점수 반영 보류.
 * POST { reason, note? }
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { disputeTradeRating } from "@/lib/trade/trade-rating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const reviewId = id?.trim();
  if (!reviewId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const sb = getTradeServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const r = await disputeTradeRating(sb as never, {
    reviewId,
    viewerId: auth.userId,
    reason: String(body?.reason ?? ""),
    note: typeof body?.note === "string" ? body.note : null,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}

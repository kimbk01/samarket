/**
 * 거래 평가 — CREW REP S5 (설계 §7.2~§7.6).
 * GET  : 자격(E1~E7)·내 평가·공개된 상대 평가(이의제기 가능 여부)
 * POST : 제출 { tradeHappened: "yes"|"chat_only", ratingType: "good"|"normal"|"bad", tags: string[], comment? }
 * 남길 말(comment)은 운영자만 보며 응답에 넣지 않는다.
 */
import { after, NextResponse } from "next/server";
import { notifyTradeRatingReceived } from "@/lib/trade/notify-trade-sold-and-rating.server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import {
  canDisputeTradeRating,
  loadTradeRatingContext,
  submitTradeRating,
  type TradeRatingRow,
} from "@/lib/trade/trade-rating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicRating(row: TradeRatingRow) {
  return {
    id: row.id,
    ratingType: row.public_review_type,
    tags: row.public_review_type === "bad" ? row.negative_tag_keys ?? [] : row.positive_tag_keys ?? [],
    status: row.rating_status,
    revealedAt: row.revealed_at,
    disputeDecision: row.dispute_decision,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { roomId } = await ctx.params;
  const id = roomId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "invalid_room" }, { status: 400 });
  const sb = getTradeServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  try {
    const now = new Date();
    const c = await loadTradeRatingContext(sb as never, id, auth.userId, now);
    if (!c) return NextResponse.json({ ok: false, error: "not_participant" }, { status: 403 });
    const theirsVisible = c.theirs && c.theirs.rating_status !== "pending_reveal" ? c.theirs : null;
    return NextResponse.json({
      ok: true,
      eligibility: {
        eligible: c.eligibility.eligible,
        reasons: c.eligibility.reasons,
        role: c.eligibility.role,
        windowEndsAt: c.eligibility.windowEndsAt,
      },
      mine: c.mine ? publicRating(c.mine) : null,
      theirs: theirsVisible
        ? { ...publicRating(theirsVisible), canDispute: canDisputeTradeRating(theirsVisible, auth.userId, now) }
        : null,
    });
  } catch (e) {
    console.error("[trade rating GET]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { roomId } = await ctx.params;
  const id = roomId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "invalid_room" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const sb = getTradeServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  try {
    const r = await submitTradeRating(sb as never, { productChatId: id, viewerId: auth.userId, body });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    /** 감사 P3 ③: 공개 전(상대 미평가)이면 받은 사람에게 「평가 도착」 알림 — 응답 뒤에 보낸다 */
    if (!r.revealed) {
      after(() =>
        notifyTradeRatingReceived(sb as never, {
          productChatId: id,
          reviewerId: auth.userId,
          revieweeId: r.revieweeId,
        }).catch(() => false)
      );
    }
    return NextResponse.json({ ok: true, reviewId: r.reviewId, revealed: r.revealed });
  } catch (e) {
    console.error("[trade rating POST]", e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/trade/product-chat/[roomId]/seller-complete — 닫힘 (거래 계획 v2 B 단계, 2026-10-28).
 * Owner 확정: 판매자는 판매완료만 한다(`/api/posts/[postId]/owner-status` `{ listing: "sold" }`).
 * 구매자를 지정하는 판매완료는 없다. 기존 `sold_buyer_id`·채팅 데이터는 그대로 둔다.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";

export async function POST() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: false, error: "trade_sold_only" }, { status: 410 });
}

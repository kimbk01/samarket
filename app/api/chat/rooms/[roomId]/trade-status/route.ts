export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat/rooms/[roomId]/trade-status — 닫힘 (거래 계획 v2 B 단계, 2026-10-28).
 * Owner 확정: 판매자는 판매완료만 한다(`/api/posts/[postId]/owner-status` `{ listing: "sold" }`).
 * 방 단위 거래 단계(문의중·예약·거래완료) 변경은 없다.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";

export async function POST() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: false, error: "trade_sold_only" }, { status: 410 });
}

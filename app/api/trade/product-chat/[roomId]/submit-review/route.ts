export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/trade/product-chat/[roomId]/submit-review — 닫힘 (거래 계획 v2 A 단계, 2026-10-28).
 * Owner 확정: 거래에 후기는 없다(판매자가 구매자를 지정하지 않음). 새 후기·신뢰 이벤트를 만들지 않는다.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";

export async function POST() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: false, error: "reviews_removed" }, { status: 410 });
}

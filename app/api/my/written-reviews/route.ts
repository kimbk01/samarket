export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/my/written-reviews — 닫힘 (거래 계획 v2 A 단계, 2026-10-28).
 * Owner 확정: 거래에 후기는 없다. 저장된 `transaction_reviews` 데이터는 지우지 않는다(어드민 열람 유지).
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ error: "reviews_removed" }, { status: 410 });
}

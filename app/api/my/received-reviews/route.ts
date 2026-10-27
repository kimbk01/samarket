export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/my/received-reviews — 닫힘 (거래 계획 2026-10-28 1단계 H-1).
 * Owner 확정: 거래에 후기는 없다. 받은 후기 응답이 익명 부정 후기의 작성자 id·닉네임·아이디를
 * 내려주던 노출도 함께 끊는다. 저장된 `transaction_reviews` 데이터는 지우지 않는다.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ error: "reviews_removed" }, { status: 410 });
}

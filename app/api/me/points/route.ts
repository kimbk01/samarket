import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getUserPointBalance } from "@/lib/admin-users/mock-admin-users";
import { getPointLedgerByUserId } from "@/lib/points/mock-point-ledger";
import { getPointChargeRequestsByUser } from "@/lib/points/mock-point-charge-requests";

/**
 * GET /api/me/points
 * 로그인 사용자의 포인트 잔액·원장·충전 신청 내역을 반환한다.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const balance = getUserPointBalance(userId);
  const ledger = getPointLedgerByUserId(userId).slice(0, 50);
  const chargeRequests = getPointChargeRequestsByUser(userId);

  return NextResponse.json({
    ok: true,
    balance,
    ledger,
    chargeRequests,
  });
}

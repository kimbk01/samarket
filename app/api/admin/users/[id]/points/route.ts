import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getUserPointBalance } from "@/lib/admin-users/mock-admin-users";
import { getPointLedgerByUserId } from "@/lib/points/mock-point-ledger";
import { getPointChargeRequestsByUser } from "@/lib/points/mock-point-charge-requests";

/**
 * GET /api/admin/users/[id]/points
 * 관리자: 특정 회원의 포인트 잔액 + 원장 + 충전 신청 내역
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const balance = getUserPointBalance(id);
  const ledger = getPointLedgerByUserId(id).slice(0, 30);
  const chargeRequests = getPointChargeRequestsByUser(id);

  return NextResponse.json({ ok: true, balance, ledger, chargeRequests });
}

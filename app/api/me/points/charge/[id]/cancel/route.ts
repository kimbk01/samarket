import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import {
  cancelPointChargeRequest,
  getPointChargeRequestById,
} from "@/lib/points/mock-point-charge-requests";

/**
 * POST /api/me/points/charge/[id]/cancel
 * 사용자 본인의 충전 신청 취소
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = getPointChargeRequestById(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (existing.userId !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const result = cancelPointChargeRequest(id);
  if (!result) {
    return NextResponse.json({ ok: false, error: "cannot_cancel" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

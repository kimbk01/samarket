import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { createPointChargeRequest } from "@/lib/points/mock-point-charge-requests";
import type { PointPaymentMethod } from "@/lib/types/point";

interface ChargeBody {
  planId: string;
  paymentMethod: PointPaymentMethod;
  depositorName?: string;
  userMemo?: string;
}

/**
 * POST /api/me/points/charge
 * 포인트 충전 신청 생성
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const userNickname = userId.slice(0, 8);

  let body: Partial<ChargeBody>;
  try {
    body = (await req.json()) as Partial<ChargeBody>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { planId, paymentMethod, depositorName, userMemo } = body;
  if (!planId || !paymentMethod) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const result = createPointChargeRequest({
    userId,
    userNickname,
    planId,
    paymentMethod,
    depositorName,
    userMemo,
  });

  if (!result) {
    return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, request: result });
}

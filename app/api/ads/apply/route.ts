import { NextRequest, NextResponse } from "next/server";
import { applyForAd } from "@/lib/ads/mock-ad-data";
import type { AdApplyRequest, AdApplyResponse } from "@/lib/ads/types";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";

/**
 * POST /api/ads/apply
 * 광고 신청. 포인트 방식이면 즉시 차감 후 pending_review.
 * bank_transfer면 ad_payment_requests 생성 후 pending_payment.
 */
export async function POST(req: NextRequest): Promise<NextResponse<AdApplyResponse>> {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Partial<AdApplyRequest>;
  try {
    body = (await req.json()) as Partial<AdApplyRequest>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { postId, adProductId, paymentMethod, depositorName, memo } = body;
  if (!postId || !adProductId || !paymentMethod) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const result = applyForAd({
    postId,
    postTitle: "(제목 미확인)",
    userId: auth.userId,
    userNickname: auth.userId === "me" ? "KASAMA" : auth.userId.slice(0, 8),
    adProductId,
    paymentMethod,
    depositorName,
    memo,
  });

  if (!result.ok) {
    const status = result.error === "insufficient_points" ? 402 : 400;
    return NextResponse.json(
      { ok: false, error: result.error, pointShortfall: result.pointShortfall },
      { status }
    );
  }

  return NextResponse.json({ ok: true, adId: result.adId });
}

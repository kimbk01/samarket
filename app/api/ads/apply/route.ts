import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AdApplyResponse } from "@/lib/ads/types";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { creditUserPoints, readUserPointBalance, spendUserPoints } from "@/lib/points/user-point-ledger";
import { applyPostAdInDb } from "@/lib/ads/post-ads-supabase";
import { fetchAdProductByIdFromDb } from "@/lib/ads/ad-products-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ads/apply
 * 광고 신청. 포인트 방식이면 DB 잔액 차감 후 post_ads pending_review.
 */
export async function POST(req: NextRequest): Promise<NextResponse<AdApplyResponse>> {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Partial<{
    postId: string;
    adProductId: string;
    paymentMethod: "points" | "bank_transfer" | "manual";
    depositorName: string;
    memo: string;
  }>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { postId, adProductId, paymentMethod, depositorName, memo } = body;
  if (!postId || !adProductId || !paymentMethod) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const productRes = await fetchAdProductByIdFromDb(sb, adProductId);
  if (!productRes.ok) {
    return NextResponse.json({ ok: false, error: "ad_product_not_found" }, { status: 400 });
  }
  const product = productRes.product;

  const adId = randomUUID();
  let pointsPreDeducted = false;

  if (paymentMethod === "points") {
    const balance = await readUserPointBalance(sb, auth.userId);
    if (balance < product.pointCost) {
      return NextResponse.json(
        { ok: false, error: "insufficient_points", pointShortfall: product.pointCost - balance },
        { status: 402 }
      );
    }
    const spend = await spendUserPoints(sb, {
      userId: auth.userId,
      amount: product.pointCost,
      entryType: "ad_purchase",
      relatedType: "ad_application",
      relatedId: adId,
      description: `${product.name} 광고 구매`,
      actorType: "user",
    });
    if (!spend.ok) {
      if (spend.code === "insufficient_balance") {
        return NextResponse.json(
          { ok: false, error: "insufficient_points", pointShortfall: product.pointCost - balance },
          { status: 402 }
        );
      }
      return NextResponse.json({ ok: false, error: spend.error }, { status: 500 });
    }
    pointsPreDeducted = true;
  }

  const result = await applyPostAdInDb(sb, {
    postId,
    userId: auth.userId,
    adProductId,
    paymentMethod,
    depositorName,
    memo,
    pointsPreDeducted,
    paidAmount: pointsPreDeducted ? product.pointCost : 0,
    presetAdId: adId,
  });

  if (!result.ok) {
    if (pointsPreDeducted) {
      await creditUserPoints(sb, {
        userId: auth.userId,
        amount: product.pointCost,
        entryType: "ad_refund",
        relatedType: "ad_application",
        relatedId: adId,
        description: `${product.name} 신청 실패 환불`,
        actorType: "system",
      });
    }
    const status =
      result.error === "insufficient_points"
        ? 402
        : result.error === "already_has_active_ad"
          ? 409
          : result.error === "post_not_found"
            ? 404
            : 400;
    return NextResponse.json(
      { ok: false, error: result.error, pointShortfall: result.pointShortfall },
      { status }
    );
  }

  return NextResponse.json({ ok: true, adId: result.adId });
}

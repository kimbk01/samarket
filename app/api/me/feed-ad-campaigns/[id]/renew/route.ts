import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { renewFeedAdCampaign } from "@/lib/ads/renew-feed-ad-campaign";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/feed-ad-campaigns/[id]/renew
 * Unchanged creative/destination renewal — Point spend + end_at extension.
 * D-01: DB 함수 `member_feed_ad_renew` 한 트랜잭션 · body.expectedCost = 화면이 보여 준 가격 (다르면 409 price_changed).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: {
    productId?: string;
    idempotencyKey?: string;
    expectedCost?: number;
    creativeOrDestinationChanged?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const idem =
    (req.headers.get("idempotency-key") ?? body.idempotencyKey ?? "").trim().slice(0, 128);
  if (!idem) {
    return NextResponse.json({ ok: false, error: "idempotency_required" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const result = await renewFeedAdCampaign(sb, {
    userId: auth.userId,
    campaignId: id,
    productId: String(body.productId ?? ""),
    idempotencyKey: idem,
    expectedCost: typeof body.expectedCost === "number" ? body.expectedCost : null,
    creativeOrDestinationChanged: Boolean(body.creativeOrDestinationChanged),
  });

  if (!result.ok) {
    if (result.error === "price_changed") {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          pointCost: result.pointCost ?? null,
          durationDays: result.durationDays ?? null,
        },
        { status: result.httpStatus }
      );
    }
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.httpStatus }
    );
  }

  return NextResponse.json({
    ok: true,
    campaignId: result.campaignId,
    endAt: result.endAt,
    pointCost: result.pointCost,
    idempotentReplay: result.idempotentReplay ?? false,
  });
}

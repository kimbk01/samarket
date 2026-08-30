import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  loadCampaignFundingRow,
  loadOwnerBusinessCashBalance,
  ownerFundDeliveryAdCampaign,
} from "@/lib/stores/advertising/delivery-ad-business-cash-writer";
import { DELIVERY_AD_BUSINESS_CASH_PLATFORM } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

function productFrom(raw: unknown): "store_sponsored" | "banner" | null {
  return raw === "banner" || raw === "store_sponsored" ? raw : null;
}

/** GET — funding + Business Cash balance for Owner campaign detail. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { campaignId } = await ctx.params;
  const product = productFrom(req.nextUrl.searchParams.get("product"));
  if (!product) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }

  const [funding, balance] = await Promise.all([
    loadCampaignFundingRow(sb, { productKind: product, campaignId }),
    loadOwnerBusinessCashBalance(sb, userId, "PHP"),
  ]);
  if (!funding) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    funding,
    businessCash: {
      balanceMinor: balance?.balanceMinor ?? 0,
      currency: balance?.currency ?? "PHP",
      externalTopUp: DELIVERY_AD_BUSINESS_CASH_PLATFORM.externalTopUp,
    },
  });
}

/** POST — fund campaign with Business Cash (exactly-once). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { campaignId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const product = productFrom(body.productKind);
  if (!product) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }

  const result = await ownerFundDeliveryAdCampaign(sb, {
    ownerUserId: userId,
    productKind: product,
    campaignId,
    idempotencyKey:
      typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
  });

  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "campaign_not_found"
          ? 404
          : result.error === "insufficient_balance"
            ? 422
            : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        detail: result.detail,
        balanceMinor: result.balanceMinor,
        requiredMinor: result.requiredMinor,
      },
      { status }
    );
  }

  return NextResponse.json({ ok: true, result });
}

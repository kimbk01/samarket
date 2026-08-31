import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadCampaignStoreCashSpendRow } from "@/lib/stores/advertising/delivery-ad-store-cash-writer";
import { DELIVERY_AD_BUSINESS_CASH_LEGACY } from "@/lib/stores/advertising/delivery-ad-store-cash-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

function productFrom(raw: unknown): "store_sponsored" | "banner" | null {
  return raw === "banner" || raw === "store_sponsored" ? raw : null;
}

/** GET — Store Cash funds-secured status for Owner campaign (Stage 1 authority). */
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

  const spend = await loadCampaignStoreCashSpendRow(sb, {
    productKind: product,
    campaignId,
  });

  return NextResponse.json({
    ok: true,
    funding: {
      status: spend?.status ?? "UNFUNDED",
      amountPhp: spend?.amountPhp ?? null,
      spendLedgerId: spend?.spendLedgerId ?? null,
      refundLedgerId: spend?.refundLedgerId ?? null,
      authority: "STORE_CASH",
    },
    legacyBusinessCash: {
      classification: DELIVERY_AD_BUSINESS_CASH_LEGACY.classification,
      ownerFund: DELIVERY_AD_BUSINESS_CASH_LEGACY.ownerFundRpc,
    },
  });
}

/**
 * POST — Legacy Business Cash fund path DISABLED for new product.
 * Stage 1 secures funds via Store Cash at submit (DEBIT_REFUND).
 */
export async function POST(_req: NextRequest, _ctx: Ctx) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  return NextResponse.json(
    {
      ok: false,
      error: "DISABLED_FOR_NEW_PRODUCT",
      detail:
        "Delivery Ads payments use Store Cash at submit. Post-approval Business Cash fund is legacy.",
      authority: "STORE_CASH",
    },
    { status: 410 }
  );
}

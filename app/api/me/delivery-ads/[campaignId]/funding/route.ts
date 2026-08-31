import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
import {
  loadCampaignStoreCashSpendRow,
  loadStoreCashBalanceForStore,
} from "@/lib/stores/advertising/delivery-ad-store-cash-writer";
import { DELIVERY_AD_BUSINESS_CASH_LEGACY } from "@/lib/stores/advertising/delivery-ad-store-cash-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ campaignId: string }> };

function productFrom(raw: unknown): "store_sponsored" | "banner" | null {
  return raw === "banner" || raw === "store_sponsored" ? raw : null;
}

async function loadOwnedCampaignStoreId(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  input: {
    product: "store_sponsored" | "banner";
    campaignId: string;
    ownerUserId: string;
  }
): Promise<string | null> {
  const table =
    input.product === "banner" ? BANNER_AD_CAMPAIGN_TABLE : STORE_SPONSORED_CAMPAIGN_TABLE;
  const { data, error } = await sb
    .from(table)
    .select("store_id, owner_user_id")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { store_id?: string; owner_user_id?: string };
  if (String(row.owner_user_id ?? "") !== input.ownerUserId) return null;
  const storeId = String(row.store_id ?? "").trim();
  return storeId || null;
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

  const storeId = await loadOwnedCampaignStoreId(sb, {
    product,
    campaignId,
    ownerUserId: userId,
  });
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const [spend, storeCash] = await Promise.all([
    loadCampaignStoreCashSpendRow(sb, {
      productKind: product,
      campaignId,
    }),
    loadStoreCashBalanceForStore(sb, storeId),
  ]);

  const status = spend?.status ?? "UNFUNDED";
  const amountPhp = spend?.amountPhp ?? null;
  const amountMinor = amountPhp == null ? null : amountPhp * 100;

  return NextResponse.json({
    ok: true,
    funding: {
      status,
      /** Alias for Owner detail UI that still reads fundingStatus. */
      fundingStatus: status,
      amountPhp,
      amountMinor,
      spendLedgerId: spend?.spendLedgerId ?? null,
      refundLedgerId: spend?.refundLedgerId ?? null,
      authority: "STORE_CASH",
    },
    /** Product ads wallet — Stage 1 Store Cash (key kept for Owner detail). */
    businessCash: {
      balanceMinor: storeCash.balanceMinor,
      balancePhp: storeCash.balancePhp,
      currency: storeCash.currency,
      authority: storeCash.authority,
      storeId,
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

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  AST_005_BUSINESS_CASH,
  DELIVERY_AD_CANONICAL_PAYMENT_MODEL,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  loadCanonicalBcFundingDetailForApplication,
  loadStoreBusinessCashBalance,
} from "@/lib/stores/advertising/canonical-business-cash-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?storeId=&campaignId=&product= — Admin AST-005 funding visibility. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const storeId = req.nextUrl.searchParams.get("storeId")?.trim() ?? "";
  const campaignId = req.nextUrl.searchParams.get("campaignId")?.trim() ?? "";
  const productRaw = req.nextUrl.searchParams.get("product");
  const product =
    productRaw === "banner" || productRaw === "store_sponsored" ? productRaw : null;

  const out: Record<string, unknown> = {
    ok: true,
    authority: AST_005_BUSINESS_CASH,
    paymentModel: DELIVERY_AD_CANONICAL_PAYMENT_MODEL.id,
  };

  if (storeId) {
    const one = await loadStoreBusinessCashBalance(sb, storeId);
    out.businessCash = {
      balanceMinor: one.balanceMinor,
      balancePhp: Math.trunc(one.balanceMinor / 100),
      currency: one.currency,
      authority: AST_005_BUSINESS_CASH,
      storeId,
    };
  }

  if (campaignId && product) {
    const funding = await loadCanonicalBcFundingDetailForApplication(sb, {
      productKind: product,
      applicationId: campaignId,
    });
    const status = funding?.status ?? "UNFUNDED";
    const amountMinor = funding?.amountMinor ?? null;
    out.funding = {
      status,
      fundingStatus: status,
      amountPhp: amountMinor == null ? null : Math.trunc(amountMinor / 100),
      amountMinor,
      spendLedgerId: funding?.spendLedgerId ?? null,
      refundLedgerId: funding?.refundLedgerId ?? null,
      fundingId: funding?.fundingId ?? null,
      fundedAt: funding?.fundedAt ?? null,
      authority: AST_005_BUSINESS_CASH,
    };
  }

  return NextResponse.json(out);
}

/**
 * POST — Legacy Admin cash credit DISABLED.
 * Ads payment authority is AST-005 Business Cash at Owner submit.
 */
export async function POST(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  return NextResponse.json(
    {
      ok: false,
      error: "DISABLED_FOR_NEW_PRODUCT",
      detail:
        "Delivery Ads payments use Business Cash. Use Admin Business Cash charge approve for top-ups, not this credit path.",
      authority: AST_005_BUSINESS_CASH,
    },
    { status: 410 }
  );
}

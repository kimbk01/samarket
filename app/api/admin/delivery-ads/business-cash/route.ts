import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  loadCampaignStoreCashSpendRow,
  loadOwnerStoreCashBalanceForAds,
  loadStoreCashBalanceForStore,
} from "@/lib/stores/advertising/delivery-ad-store-cash-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?ownerUserId=&storeId=&campaignId=&product= — Admin Store Cash funding visibility. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const ownerUserId = req.nextUrl.searchParams.get("ownerUserId")?.trim() ?? "";
  const storeId = req.nextUrl.searchParams.get("storeId")?.trim() ?? "";
  const campaignId = req.nextUrl.searchParams.get("campaignId")?.trim() ?? "";
  const productRaw = req.nextUrl.searchParams.get("product");
  const product =
    productRaw === "banner" || productRaw === "store_sponsored" ? productRaw : null;

  const out: Record<string, unknown> = { ok: true, authority: "STORE_CASH" };
  if (storeId) {
    const one = await loadStoreCashBalanceForStore(sb, storeId);
    out.businessCash = {
      balanceMinor: one.balanceMinor,
      balancePhp: one.balancePhp,
      currency: one.currency,
      authority: one.authority,
      storeId,
    };
  } else if (ownerUserId) {
    const sum = await loadOwnerStoreCashBalanceForAds(sb, { ownerUserId });
    out.businessCash = {
      balanceMinor: sum.balanceMinor,
      balancePhp: sum.balancePhp,
      currency: sum.currency,
      authority: sum.authority,
      storeCount: sum.storeCount,
    };
  }
  if (campaignId && product) {
    const spend = await loadCampaignStoreCashSpendRow(sb, {
      productKind: product,
      campaignId,
    });
    const status = spend?.status ?? "UNFUNDED";
    const amountPhp = spend?.amountPhp ?? null;
    out.funding = {
      status,
      fundingStatus: status,
      amountPhp,
      amountMinor: amountPhp == null ? null : amountPhp * 100,
      spendLedgerId: spend?.spendLedgerId ?? null,
      refundLedgerId: spend?.refundLedgerId ?? null,
      authority: "STORE_CASH",
    };
  }
  return NextResponse.json(out);
}

/**
 * POST — Legacy Admin Business Cash credit DISABLED for new product.
 * Ads payment authority is Store Cash (Stage 1).
 */
export async function POST(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  return NextResponse.json(
    {
      ok: false,
      error: "DISABLED_FOR_NEW_PRODUCT",
      detail:
        "Delivery Ads payments use Store Cash. Legacy Admin Business Cash credit does not fund ads.",
      authority: "STORE_CASH",
    },
    { status: 410 }
  );
}

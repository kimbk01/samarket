import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  pickBestEligibleCouponQuote,
  quoteStoreCouponsForCheckout,
} from "@/lib/stores/store-coupon-best-eligible";
import { buildCheckoutQuoteView } from "@/lib/stores/store-coupon-product-view";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId")?.trim() ?? "";
  const subtotalPhp = Math.floor(Number(url.searchParams.get("subtotalPhp") ?? "0"));
  const menuDiscountPhp = Math.floor(Number(url.searchParams.get("menuDiscountPhp") ?? "0"));
  const deliveryFeePhp = Math.floor(Number(url.searchParams.get("deliveryFeePhp") ?? "0"));
  const itemGrossPhp = Math.floor(Number(url.searchParams.get("itemGrossPhp") ?? subtotalPhp - menuDiscountPhp));
  const appliedUserCouponId = url.searchParams.get("appliedUserCouponId")?.trim() ?? "";

  if (!storeId) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const quotes = await quoteStoreCouponsForCheckout({
    sb,
    buyerUserId: userId,
    storeId,
    itemGrossPhp,
  });
  const best = pickBestEligibleCouponQuote(quotes);
  const applied =
    appliedUserCouponId
      ? quotes.find((q) => q.userCouponId === appliedUserCouponId && q.discountAmount > 0 && !q.ineligibleReason) ??
        null
      : best;

  const quote = buildCheckoutQuoteView({
    subtotalPhp,
    menuDiscountPhp,
    couponTitle: applied?.title ?? null,
    couponNumber: applied?.couponNumber ?? null,
    couponDiscountPhp: applied?.discountAmount ?? 0,
    deliveryFeePhp,
  });

  return NextResponse.json({
    ok: true,
    quote,
    appliedUserCouponId: applied?.userCouponId ?? null,
    appliedCampaignId: applied?.campaignId ?? null,
  });
}

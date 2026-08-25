import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  pickBestEligibleCouponQuote,
  quoteStoreCouponsForCheckout,
} from "@/lib/stores/store-coupon-best-eligible";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId")?.trim() ?? "";
  const itemGrossPhp = Math.floor(Number(url.searchParams.get("itemGrossPhp") ?? "0"));
  if (!storeId) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  const quotes = await quoteStoreCouponsForCheckout({
    sb,
    buyerUserId: userId,
    storeId,
    itemGrossPhp,
  });
  return NextResponse.json({
    ok: true,
    quotes,
    best: pickBestEligibleCouponQuote(quotes),
  });
}

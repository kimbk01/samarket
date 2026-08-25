import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadCustomerCouponWalletCards } from "@/lib/stores/load-customer-coupon-wallet-cards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const tab = new URL(req.url).searchParams.get("tab")?.trim() || "available";
  const storeId = new URL(req.url).searchParams.get("storeId")?.trim() || "";
  const loaded = await loadCustomerCouponWalletCards(sb, {
    buyerUserId: userId,
    tab: tab === "all" ? "all" : tab,
    storeId: storeId || undefined,
  });
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error, cards: [] }, { status: 500 });
  }
  return NextResponse.json({ ok: true, cards: loaded.cards, coupons: loaded.cards });
}

import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { filterCheckoutEligibleGifts } from "@/lib/gift-certificate/checkout-eligible-gifts";
import { loadGiftWallet } from "@/lib/gift-certificate/load-gift-wallet";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/gift-certificates/checkout-eligible?storeId=
 * Same-store redeemable gifts for the current buyer (server authority).
 */
export async function GET(req: Request) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const storeId = new URL(req.url).searchParams.get("storeId")?.trim() || "";
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "store_id_required" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const loaded = await loadGiftWallet(sb, userId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
  }
  // available already excludes GIFT_LOCKED / FULLY_REDEEMED / SUSPENDED
  const gifts = filterCheckoutEligibleGifts(loaded.wallet.available, storeId);
  return NextResponse.json({ ok: true, storeId, gifts });
}

import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { filterCheckoutEligibleGifts } from "@/lib/gift-certificate/checkout-eligible-gifts";
import { loadGiftWallet } from "@/lib/gift-certificate/load-gift-wallet";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/gift-certificates/checkout-eligible?storeId=
 * STORE: same-store only. PLATFORM: when checkout store is order-eligible.
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

  const { data: storeRow } = await sb
    .from("stores")
    .select("id, approval_status, is_visible, is_open, point_commerce_blocked")
    .eq("id", storeId)
    .maybeSingle();
  const checkoutStoreEligible =
    !!storeRow &&
    String((storeRow as { approval_status?: unknown }).approval_status) === "approved" &&
    (storeRow as { is_visible?: unknown }).is_visible === true &&
    (storeRow as { is_open?: unknown }).is_open !== false &&
    (storeRow as { point_commerce_blocked?: unknown }).point_commerce_blocked !== true;

  const gifts = filterCheckoutEligibleGifts(loaded.wallet.available, storeId, {
    checkoutStoreEligible,
  });
  return NextResponse.json({ ok: true, storeId, gifts });
}

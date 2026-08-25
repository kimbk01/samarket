import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
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
  let q = sb
    .from("coupon_user_entitlements")
    .select(
      "id, campaign_id, store_id, status, reserved_php, expires_at, redeemed_order_id, created_at, store_coupon_campaigns(title, discount_type, discount_value, min_order_amount)"
    )
    .eq("buyer_user_id", userId);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q.order("expires_at", { ascending: true }).limit(200);
  if (error) {
    return NextResponse.json({ ok: false, error: "db_error", coupons: [] }, { status: 500 });
  }
  const now = Date.now();
  const rows = (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const expires = Date.parse(String(r.expires_at ?? ""));
    const status = String(r.status ?? "");
    let bucket = "available";
    if (status === "revoked") bucket = "expired";
    else if (status === "redeemed") bucket = "redeemed";
    else if (Number.isFinite(expires) && expires <= now) bucket = "expired";
    else if (status === "available" || status === "restored") {
      bucket = Number.isFinite(expires) && expires - now < 3 * 24 * 60 * 60 * 1000 ? "expiring" : "available";
    } else {
      bucket = "expired";
    }
    return { ...r, bucket };
  });
  const filtered =
    tab === "all" ? rows : rows.filter((r) => (tab === "expiring" ? r.bucket === "expiring" : r.bucket === tab));
  return NextResponse.json({ ok: true, coupons: filtered });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attachCustomerCouponWalletLabels,
  couponWalletStatusKey,
} from "@/lib/stores/customer-coupon-wallet-view";
import { loadStoreCouponVisualContextBatch } from "@/lib/stores/load-store-coupon-visual-context";
import {
  buildCustomerCouponCardView,
  type CustomerCouponCardView,
} from "@/lib/stores/store-coupon-product-view";

const ENT_SELECT =
  "id, campaign_id, store_id, status, reserved_php, expires_at, redeemed_order_id, created_at, coupon_number, store_coupon_campaigns(title, discount_type, discount_value, min_order_amount, max_discount, terms_copy, funding_mode, first_order_scope, end_at, issuer_role, campaign_purpose, created_by_user_id)";

export async function loadCustomerCouponWalletCards(
  sb: SupabaseClient,
  input: { buyerUserId: string; tab?: string; storeId?: string }
): Promise<{ ok: true; cards: CustomerCouponCardView[] } | { ok: false; error: string }> {
  let q = sb.from("coupon_user_entitlements").select(ENT_SELECT).eq("buyer_user_id", input.buyerUserId);
  if (input.storeId) q = q.eq("store_id", input.storeId.trim());
  const { data, error } = await q.order("expires_at", { ascending: true }).limit(200);
  if (error) return { ok: false, error: "db_error" };

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
    } else bucket = "expired";
    return { ...r, bucket } as Record<string, unknown> & { bucket: string };
  });

  const storeIds = [...new Set(rows.map((r) => String(r.store_id ?? "").trim()).filter(Boolean))];
  const orderIds = [...new Set(rows.map((r) => String(r.redeemed_order_id ?? "").trim()).filter(Boolean))];
  const visualByStoreId = await loadStoreCouponVisualContextBatch(sb, storeIds);
  const [{ data: stores }, { data: orders }] = await Promise.all([
    storeIds.length
      ? sb.from("stores").select("id, store_name, slug").in("id", storeIds)
      : Promise.resolve({ data: [] as { id: string; store_name: string | null; slug: string | null }[] }),
    orderIds.length
      ? sb.from("store_orders").select("id, order_no, created_at").in("id", orderIds)
      : Promise.resolve({ data: [] as { id: string; order_no: string | null; created_at: string | null }[] }),
  ]);
  const labeled = attachCustomerCouponWalletLabels(rows, stores ?? [], orders ?? []);

  const cards: CustomerCouponCardView[] = labeled.map((r) => {
    const campRaw = r.store_coupon_campaigns as Record<string, unknown> | Record<string, unknown>[] | null;
    const camp = Array.isArray(campRaw) ? campRaw[0] : campRaw;
    const storeId = String(r.store_id ?? "");
    const orderId = String(r.redeemed_order_id ?? "");
    const order = (orders ?? []).find((o) => String(o.id) === orderId);
    return buildCustomerCouponCardView({
      entitlement: r as Record<string, unknown>,
      campaign: (camp ?? {}) as Record<string, unknown>,
      visual: visualByStoreId[storeId] ?? {
        storeName: String(r.store_name ?? ""),
        storeSlug: String(r.store_slug ?? "") || null,
        logoUrl: null,
        menuPreviewTitles: [],
        menuPreviewIsPromotional: true,
      },
      bucket: String(r.bucket),
      walletStatusKey: couponWalletStatusKey(r),
      orderNo: (order?.order_no ?? String(r.order_no ?? "")) || null,
      orderCreatedAt: (order?.created_at ?? String(r.order_created_at ?? "")) || null,
    });
  });

  const tab = input.tab?.trim() || "available";
  const filtered =
    tab === "all"
      ? cards
      : cards.filter((c) => (tab === "expiring" ? c.bucket === "expiring" : c.bucket === tab));

  return { ok: true, cards: filtered };
}

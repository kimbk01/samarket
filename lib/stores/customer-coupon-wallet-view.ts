export type CustomerCouponWalletTab = "held" | "redeemed";

export const CUSTOMER_COUPON_WALLET_TABS: readonly CustomerCouponWalletTab[] = [
  "held",
  "redeemed",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOpaqueId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function formatCouponWalletDay(iso?: string | null): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export function couponWalletStatusKey(row: {
  bucket?: string | null;
  status?: string | null;
}):
  | "store_coupon_wallet_status_revoked"
  | "store_coupon_wallet_status_redeemed"
  | "store_coupon_wallet_status_expired"
  | "store_coupon_wallet_status_expiring"
  | "store_coupon_wallet_status_available" {
  if (String(row.status ?? "") === "revoked") return "store_coupon_wallet_status_revoked";
  const bucket = String(row.bucket ?? "");
  if (bucket === "redeemed") return "store_coupon_wallet_status_redeemed";
  if (bucket === "expired") return "store_coupon_wallet_status_expired";
  if (bucket === "expiring") return "store_coupon_wallet_status_expiring";
  return "store_coupon_wallet_status_available";
}

/** Customer presentation: held = usable instances; redeemed only. Hide expired/revoked. */
export function customerWalletPresentationTab(
  bucket: string | null | undefined
): CustomerCouponWalletTab | null {
  const b = String(bucket ?? "");
  if (b === "available" || b === "expiring") return "held";
  if (b === "redeemed") return "redeemed";
  return null;
}

export function attachCustomerCouponWalletLabels<T extends Record<string, unknown>>(
  rows: T[],
  stores: Array<{ id?: string | null; store_name?: string | null; slug?: string | null }>,
  orders: Array<{ id?: string | null; order_no?: string | null; created_at?: string | null }>
): Array<
  T & {
    store_name: string | null;
    store_slug: string | null;
    order_no: string | null;
    order_created_at: string | null;
  }
> {
  const storeById = new Map<string, { store_name: string | null; slug: string | null }>();
  for (const s of stores) {
    const id = String(s.id ?? "").trim();
    if (!id) continue;
    storeById.set(id, {
      store_name: String(s.store_name ?? "").trim() || null,
      slug: String(s.slug ?? "").trim() || null,
    });
  }
  const orderById = new Map<string, { order_no: string | null; created_at: string | null }>();
  for (const o of orders) {
    const id = String(o.id ?? "").trim();
    if (!id) continue;
    orderById.set(id, {
      order_no: String(o.order_no ?? "").trim() || null,
      created_at: String(o.created_at ?? "").trim() || null,
    });
  }
  return rows.map((r) => {
    const storeId = String(r.store_id ?? "").trim();
    const store = storeById.get(storeId);
    const orderId = String(r.redeemed_order_id ?? "").trim();
    const order = orderById.get(orderId);
    return {
      ...r,
      store_name: store?.store_name ?? null,
      store_slug: store?.slug ?? null,
      order_no: order?.order_no ?? null,
      order_created_at: order?.created_at ?? null,
    };
  });
}

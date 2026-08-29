/**
 * CUT B — Delivery ad product registry (DB + TS single vocabulary).
 */

export const DELIVERY_AD_PRODUCT_TABLE = "delivery_ad_products" as const;

export const DELIVERY_AD_PRODUCT_KEYS = ["store_sponsored", "banner"] as const;
export type DeliveryAdProductKey = (typeof DELIVERY_AD_PRODUCT_KEYS)[number];

export type DeliveryAdCreativeMode = "STORE" | "IMAGE";

export type DeliveryAdProductRow = {
  key: DeliveryAdProductKey;
  displayName: string;
  campaignAuthority: "store_paid_ad_campaigns" | "store_banner_ad_campaigns";
  creativeMode: DeliveryAdCreativeMode;
  isActive: boolean;
};

export const DELIVERY_AD_PRODUCT_REGISTRY: readonly DeliveryAdProductRow[] = [
  {
    key: "store_sponsored",
    displayName: "Store sponsored",
    campaignAuthority: "store_paid_ad_campaigns",
    creativeMode: "STORE",
    isActive: true,
  },
  {
    key: "banner",
    displayName: "Banner",
    campaignAuthority: "store_banner_ad_campaigns",
    creativeMode: "IMAGE",
    isActive: true,
  },
] as const;

export function isDeliveryAdProductKey(value: unknown): value is DeliveryAdProductKey {
  return value === "store_sponsored" || value === "banner";
}

export function deliveryAdProductByKey(key: DeliveryAdProductKey): DeliveryAdProductRow {
  const row = DELIVERY_AD_PRODUCT_REGISTRY.find((p) => p.key === key);
  if (!row) throw new Error(`unknown_delivery_ad_product:${String(key)}`);
  return row;
}

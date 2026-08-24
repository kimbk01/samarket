/**
 * Stores A — coupon insertion authority (display terms; checkout redemption separate).
 */

export const STORE_COUPON_CAMPAIGN_TABLE = "store_coupon_campaigns" as const;

export const STORE_COUPON_DISCOUNT_TYPES = ["percent", "fixed_amount"] as const;
export type StoreCouponDiscountType = (typeof STORE_COUPON_DISCOUNT_TYPES)[number];

export type StoreCouponCampaignRow = {
  id: string;
  storeId: string;
  title: string;
  discountType: StoreCouponDiscountType;
  discountValue: number;
  minOrderAmount: number | null;
  termsCopy: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
};

export function isStoreCouponDiscountType(value: unknown): value is StoreCouponDiscountType {
  return value === "percent" || value === "fixed_amount";
}

export function isStoreCouponCampaignActive(
  row: Pick<StoreCouponCampaignRow, "isActive" | "startAt" | "endAt">,
  nowMs: number = Date.now()
): boolean {
  if (!row.isActive) return false;
  const startMs = Date.parse(row.startAt);
  const endMs = Date.parse(row.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
  return startMs <= nowMs && endMs > nowMs;
}

export function compareStoreCouponCampaigns(
  a: Pick<StoreCouponCampaignRow, "id" | "startAt" | "endAt">,
  b: Pick<StoreCouponCampaignRow, "id" | "startAt" | "endAt">
): number {
  const aEnd = Date.parse(a.endAt);
  const bEnd = Date.parse(b.endAt);
  if (aEnd !== bEnd) return aEnd - bEnd;
  const aStart = Date.parse(a.startAt);
  const bStart = Date.parse(b.startAt);
  if (aStart !== bStart) return bStart - aStart;
  return a.id.localeCompare(b.id);
}

export function selectActiveStoreCouponCampaigns(
  rows: readonly StoreCouponCampaignRow[],
  nowMs: number = Date.now()
): StoreCouponCampaignRow[] {
  return rows
    .filter((r) => isStoreCouponCampaignActive(r, nowMs))
    .sort(compareStoreCouponCampaigns);
}

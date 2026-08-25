import type { StoreCouponFirstOrderScope } from "@/lib/stores/store-coupon-ssot";

export function isFirstOrderTargetEligible(input: {
  scope: StoreCouponFirstOrderScope | null | undefined;
  hasCompletedOrderAtStore: boolean;
  hasCompletedOrderOnPlatform: boolean;
}): boolean {
  if (input.scope == null) return true;
  if (input.scope === "STORE") return !input.hasCompletedOrderAtStore;
  if (input.scope === "PLATFORM") return !input.hasCompletedOrderOnPlatform;
  return true;
}

export function browseShowsGenericCouponBadge(
  couponBadgeByStoreId: Record<string, unknown> | null | undefined,
  storeId: string | null | undefined
): boolean {
  const id = String(storeId ?? "").trim();
  if (!id || !couponBadgeByStoreId) return false;
  return Object.prototype.hasOwnProperty.call(couponBadgeByStoreId, id);
}

export type StoreCouponDetailUxState = "login" | "claim" | "held" | "unusable" | "hidden";

export function resolveStoreCouponDetailUxState(input: {
  authed: boolean;
  hasCampaign: boolean;
  claimed: boolean;
  ineligibleReason?: string | null;
}): StoreCouponDetailUxState {
  if (input.hasCampaign && !input.authed) return "login";
  if (input.hasCampaign && input.claimed) return "held";
  if (input.hasCampaign) return "claim";
  if (String(input.ineligibleReason ?? "").trim()) return "unusable";
  return "hidden";
}

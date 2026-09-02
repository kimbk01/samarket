/**
 * DIBAY Support Center — FAB / entry context SSOT.
 * Visibility is opt-in per screen (`enabled: true`). No pathname inference.
 */

export type SupportAudience = "MEMBER" | "OWNER";

export const MEMBER_SUPPORT_CATEGORIES = [
  "ACCOUNT",
  "PAYMENT_RECHARGE",
  "ORDER",
  "DELIVERY",
  "GIFT_CERTIFICATE",
  "COUPON",
  "REFUND",
  "REPORT",
  "AD",
  "TECHNICAL",
  "OTHER",
] as const;

export const OWNER_SUPPORT_CATEGORIES = [
  "STORE",
  "STORE_APPROVAL",
  "CASH_COIN",
  "RECHARGE",
  "BANK_ACCOUNT",
  "SETTLEMENT",
  "DELIVERY_AD",
  "CAMPAIGN",
  "PRODUCT_MENU",
  "COUPON",
  "GIFT_CERTIFICATE",
  "ORDER_DELIVERY",
  "ACCOUNT",
  "TECHNICAL",
  "OTHER",
] as const;

export type MemberSupportCategory = (typeof MEMBER_SUPPORT_CATEGORIES)[number];
export type OwnerSupportCategory = (typeof OWNER_SUPPORT_CATEGORIES)[number];
export type SupportCategory = MemberSupportCategory | OwnerSupportCategory;

export type SupportContext = {
  enabled: boolean;
  audience: SupportAudience;
  category: SupportCategory;
  sourceSurface: string;
  referenceType?: string;
  referenceId?: string;
  storeId?: string;
};

export const DISABLED_SUPPORT_CONTEXT: SupportContext = {
  enabled: false,
  audience: "MEMBER",
  category: "OTHER",
  sourceSurface: "none",
};

export type MemberSupportContextInput = {
  enabled: boolean;
  category: MemberSupportCategory;
  sourceSurface: string;
  referenceType?: string;
  referenceId?: string;
};

export type OwnerSupportContextInput = {
  enabled: boolean;
  category: OwnerSupportCategory;
  sourceSurface: string;
  storeId?: string;
  referenceType?: string;
  referenceId?: string;
};

export function buildMemberSupportContext(input: MemberSupportContextInput): SupportContext {
  return {
    enabled: input.enabled === true,
    audience: "MEMBER",
    category: input.category,
    sourceSurface: input.sourceSurface.trim() || "unknown",
    referenceType: input.referenceType?.trim() || undefined,
    referenceId: input.referenceId?.trim() || undefined,
  };
}

export function buildOwnerSupportContext(input: OwnerSupportContextInput): SupportContext {
  const storeId = input.storeId?.trim() || undefined;
  return {
    enabled: input.enabled === true,
    audience: "OWNER",
    category: input.category,
    sourceSurface: input.sourceSurface.trim() || "unknown",
    storeId,
    referenceType: input.referenceType?.trim() || undefined,
    referenceId: input.referenceId?.trim() || undefined,
  };
}

export function isSupportContextEnabled(ctx: SupportContext | null | undefined): ctx is SupportContext {
  return Boolean(ctx && ctx.enabled === true);
}

export const SUPPORT_CONTEXT_SESSION_KEY = "dibay:support:center:pending-context";

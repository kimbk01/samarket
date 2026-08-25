import type { StoreCouponCampaignPurpose, StoreCouponIssuerRole } from "@/lib/stores/store-coupon-ssot";

export type StoreCouponIssuerRoleKey =
  | "store_coupon_issuer_role_owner"
  | "store_coupon_issuer_role_admin"
  | "store_coupon_issuer_role_system"
  | "store_coupon_issuer_legacy_not_proven";

export type StoreCouponPurposeKey =
  | "store_coupon_purpose_new_customer"
  | "store_coupon_purpose_repeat_purchase"
  | "store_coupon_purpose_new_menu"
  | "store_coupon_purpose_store_promo"
  | "store_coupon_purpose_platform_event"
  | "store_coupon_purpose_legacy_not_proven";

export type StoreCouponIssuerView = {
  role: StoreCouponIssuerRole | null;
  roleKey: StoreCouponIssuerRoleKey;
  userId: string | null;
  displayName: string | null;
  legacyNotProven: boolean;
};

export type StoreCouponProviderView = {
  providerKey:
    | "store_coupon_provider_store"
    | "store_coupon_provider_platform"
    | "store_coupon_provider_shared";
  fundingMode: string;
};

export type StoreCouponPurposeView = {
  purpose: StoreCouponCampaignPurpose | null;
  purposeKey: StoreCouponPurposeKey;
  legacyNotProven: boolean;
};

const ISSUER_ROLE_KEYS = {
  owner: "store_coupon_issuer_role_owner",
  admin: "store_coupon_issuer_role_admin",
  system: "store_coupon_issuer_role_system",
} as const satisfies Record<StoreCouponIssuerRole, StoreCouponIssuerRoleKey>;

const PURPOSE_KEYS = {
  new_customer_acquisition: "store_coupon_purpose_new_customer",
  repeat_purchase: "store_coupon_purpose_repeat_purchase",
  new_menu_promotion: "store_coupon_purpose_new_menu",
  store_promotion: "store_coupon_purpose_store_promo",
  platform_event: "store_coupon_purpose_platform_event",
} as const satisfies Record<StoreCouponCampaignPurpose, StoreCouponPurposeKey>;

export function resolveStoreCouponIssuerView(input: {
  issuerRole: unknown;
  createdByUserId: unknown;
  actorLabel?: string | null;
}): StoreCouponIssuerView {
  const roleRaw = String(input.issuerRole ?? "").trim();
  const role =
    roleRaw === "owner" || roleRaw === "admin" || roleRaw === "system" ? roleRaw : null;
  const userId = input.createdByUserId == null ? null : String(input.createdByUserId).trim() || null;
  const displayName = String(input.actorLabel ?? "").trim() || null;
  return {
    role,
    roleKey: role ? ISSUER_ROLE_KEYS[role] : "store_coupon_issuer_legacy_not_proven",
    userId,
    displayName,
    legacyNotProven: !role,
  };
}

export function resolveStoreCouponPurposeView(purpose: unknown): StoreCouponPurposeView {
  const raw = String(purpose ?? "").trim();
  const known = raw in PURPOSE_KEYS ? (raw as StoreCouponCampaignPurpose) : null;
  return {
    purpose: known,
    purposeKey: known ? PURPOSE_KEYS[known] : "store_coupon_purpose_legacy_not_proven",
    legacyNotProven: !known,
  };
}

export function resolveStoreCouponProviderView(fundingMode: unknown): StoreCouponProviderView {
  const mode = String(fundingMode ?? "STORE_FUNDED");
  if (mode === "PLATFORM_FUNDED") {
    return { providerKey: "store_coupon_provider_platform", fundingMode: mode };
  }
  if (mode === "SHARED_FUNDED") {
    return { providerKey: "store_coupon_provider_shared", fundingMode: mode };
  }
  return { providerKey: "store_coupon_provider_store", fundingMode: "STORE_FUNDED" };
}

export function storeCouponTargetKey(firstOrderScope: unknown):
  | "store_coupon_target_first_store"
  | "store_coupon_target_first_platform"
  | null {
  const s = String(firstOrderScope ?? "").trim();
  if (s === "STORE") return "store_coupon_target_first_store";
  if (s === "PLATFORM") return "store_coupon_target_first_platform";
  return null;
}

export function storeCouponCustomerProviderKey(
  fundingMode: unknown
): StoreCouponProviderView["providerKey"] {
  return resolveStoreCouponProviderView(fundingMode).providerKey;
}

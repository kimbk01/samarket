/**
 * P0-A — Delivery Ads commercial package / Partner SSOT (server authority).
 * Launch pricing = FIXED DURATION PACKAGE (PRODUCT × PLACEMENT × PACKAGE).
 * No charge collection. No Point. No organic ranking effects.
 */

import { assertDeliveryAdMoneyMinor } from "@/lib/stores/advertising/delivery-ad-billing-contract";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";

export const DELIVERY_AD_PACKAGE_TABLE = "delivery_ad_packages" as const;
export const DELIVERY_AD_PLACEMENT_COMMERCIAL_TABLE = "delivery_ad_placement_commercial" as const;
export const DELIVERY_AD_EXTENSION_POLICY_TABLE = "delivery_ad_extension_policy" as const;
export const DELIVERY_AD_PARTNER_CONFIG_TABLE = "delivery_ad_partner_config" as const;
export const DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE = "delivery_ad_partner_memberships" as const;
export const DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE =
  "delivery_ad_campaign_commercial_snapshots" as const;
export const DELIVERY_AD_EXTENSION_SNAPSHOT_TABLE = "delivery_ad_extension_snapshots" as const;
export const DELIVERY_AD_COMMERCIAL_OVERRIDE_AUDIT_TABLE =
  "delivery_ad_commercial_override_audit" as const;

export const DELIVERY_AD_COMMERCIAL_CURRENCY_DEFAULT = "PHP" as const;

export const DELIVERY_AD_CAMPAIGN_SOURCES = ["OWNER_PAID", "DIBAY_FIRST_PARTY"] as const;
export type DeliveryAdCampaignSource = (typeof DELIVERY_AD_CAMPAIGN_SOURCES)[number];

export const DELIVERY_AD_COMMERCIAL_STATUSES = [
  "PRICED",
  "LEGACY_UNPRICED",
  "FIRST_PARTY_NO_CHARGE",
  "NOT_CONFIGURED",
] as const;
export type DeliveryAdCommercialStatus = (typeof DELIVERY_AD_COMMERCIAL_STATUSES)[number];

export const DELIVERY_AD_EXTENSION_KINDS = [
  "PAID",
  "ADMIN_FREE_COMPENSATION",
  "ADMIN_OVERRIDE",
] as const;
export type DeliveryAdExtensionKind = (typeof DELIVERY_AD_EXTENSION_KINDS)[number];

/**
 * Proven sellable inventory keys for launch commercial catalog.
 * SEARCH_TOP kept in schema/runtime but NOT launch-sellable (product recovery).
 */
export const DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT = {
  store_sponsored: ["STORES_HOME_FEED", "STORES_CATEGORY_FEED"],
  banner: ["STORES_HOME_HERO"],
} as const satisfies Record<DeliveryAdProductKey, readonly string[]>;

/** Seed structure codes only — NOT price authority. */
export const DELIVERY_AD_PACKAGE_SEED_CODES = ["7_day", "15_day", "30_day"] as const;

export type DeliveryAdPackageRow = {
  id: string;
  productKind: DeliveryAdProductKey;
  inventoryKey: string;
  code: string;
  displayName: string;
  durationDays: number;
  /** null = NOT_CONFIGURED */
  priceAmountMinor: number | null;
  currency: string;
  enabled: boolean;
  displayOrder: number;
};

export type DeliveryAdPlacementCommercialRow = {
  productKind: DeliveryAdProductKey;
  inventoryKey: string;
  sellable: boolean;
};

export type DeliveryAdPartnerConfigRow = {
  enabled: boolean;
  monthlyFeeMinor: number | null;
  currency: string;
  advertisingDiscountPercent: number;
  benefitJson: Record<string, unknown>;
  acceptingNewMembers: boolean;
  version: number;
};

/** R4 membership lifecycle — PENDING_REVIEW added for Owner apply / Admin approve. */
export const DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES = [
  "NONE",
  "PENDING_REVIEW",
  "ACTIVE",
  "PAST_DUE",
  "CANCEL_PENDING",
  "ENDED",
  "REJECTED",
] as const;
export type DeliveryAdPartnerMembershipStatus =
  (typeof DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES)[number];

/** Open = blocks a new Owner apply for the same store. */
export const DELIVERY_AD_PARTNER_OPEN_STATUSES = [
  "PENDING_REVIEW",
  "ACTIVE",
  "CANCEL_PENDING",
  "PAST_DUE",
] as const satisfies ReadonlyArray<DeliveryAdPartnerMembershipStatus>;

/** Ad package discount — PENDING_REVIEW / REJECTED must never qualify. */
export const DELIVERY_AD_PARTNER_DISCOUNT_ELIGIBLE_STATUSES = [
  "ACTIVE",
  "CANCEL_PENDING",
] as const satisfies ReadonlyArray<DeliveryAdPartnerMembershipStatus>;

export const DELIVERY_AD_PARTNER_PERIOD_DAYS_DEFAULT = 30 as const;

/** Partner monthly fee — canonical Cash secure before PENDING_REVIEW. */
export const DELIVERY_AD_PARTNER_PAYMENT = {
  status: "BUSINESS_CASH_SECURE_REQUIRED",
  businessCashCharge: true,
  assetId: "AST-005",
} as const;

export type DeliveryAdPartnerMembershipRow = {
  id: string;
  storeId: string;
  status: DeliveryAdPartnerMembershipStatus;
  periodStart: string | null;
  periodEnd: string | null;
  feeSnapshotMinor: number | null;
  currency: string;
  benefitSnapshot: Record<string, unknown>;
  advertisingDiscountPercentSnapshot: number;
  configVersionSnapshot: number | null;
  cancelRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryAdPartnerMembershipEligibility = {
  membershipId: string | null;
  active: boolean;
  advertisingDiscountPercent: number;
  benefitSnapshot: Record<string, unknown>;
  status?: DeliveryAdPartnerMembershipStatus | null;
};

export type DeliveryAdExtensionPolicyRow = {
  extensionEnabled: boolean;
  additionalDayPriceMinor: number | null;
  currency: string;
  minimumExtensionDays: number;
  maximumExtensionDays: number;
  extensionUnitDays: number;
};

export type DeliveryAdCommercialQuoteInput = {
  productKind: DeliveryAdProductKey;
  inventoryKey: string;
  package: DeliveryAdPackageRow;
  placement: DeliveryAdPlacementCommercialRow | null;
  productEnabled: boolean;
  acceptingApplications: boolean;
  partner: DeliveryAdPartnerMembershipEligibility;
  campaignSource?: DeliveryAdCampaignSource;
};

export type DeliveryAdCommercialQuoteOk = {
  ok: true;
  sellable: true;
  productKind: DeliveryAdProductKey;
  inventoryKey: string;
  packageId: string;
  packageCode: string;
  packageDisplayName: string;
  durationDays: number;
  basePriceMinor: number;
  partnerMembershipId: string | null;
  partnerDiscountPercent: number;
  partnerBenefitSnapshot: Record<string, unknown>;
  finalPayableMinor: number;
  currency: string;
  campaignSource: DeliveryAdCampaignSource;
  commercialStatus: "PRICED" | "FIRST_PARTY_NO_CHARGE";
};

export type DeliveryAdCommercialQuoteErr = {
  ok: false;
  error:
    | "product_disabled"
    | "applications_paused"
    | "placement_not_sellable"
    | "package_disabled"
    | "price_not_configured"
    | "invalid_duration"
    | "invalid_discount"
    | "negative_payable"
    | "inventory_product_mismatch";
};

export type DeliveryAdCommercialQuote = DeliveryAdCommercialQuoteOk | DeliveryAdCommercialQuoteErr;

export type DeliveryAdCampaignCommercialSnapshot = {
  campaignId: string;
  productKind: DeliveryAdProductKey;
  campaignSource: DeliveryAdCampaignSource;
  inventoryKey: string;
  packageId: string | null;
  packageCode: string | null;
  packageDisplayName: string | null;
  durationDaysSnapshot: number | null;
  basePriceMinorSnapshot: number | null;
  partnerMembershipId: string | null;
  partnerDiscountPercentSnapshot: number;
  partnerBenefitSnapshot: Record<string, unknown>;
  finalPayableMinor: number | null;
  currency: string;
  pricedAt: string | null;
  commercialStatus: DeliveryAdCommercialStatus;
};

/**
 * Apply Partner advertising discount to base price (integer minor units).
 * Floor division — never trust client payable.
 */
export function applyPartnerAdvertisingDiscountMinor(input: {
  basePriceMinor: number;
  discountPercent: number;
}): { ok: true; finalPayableMinor: number } | { ok: false; error: "invalid_discount" | "negative_payable" } {
  if (!assertDeliveryAdMoneyMinor(input.basePriceMinor)) {
    return { ok: false, error: "negative_payable" };
  }
  const pct = input.discountPercent;
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    return { ok: false, error: "invalid_discount" };
  }
  const discountMinor = Math.floor((input.basePriceMinor * pct) / 100);
  const finalPayableMinor = input.basePriceMinor - discountMinor;
  if (!assertDeliveryAdMoneyMinor(finalPayableMinor)) {
    return { ok: false, error: "negative_payable" };
  }
  return { ok: true, finalPayableMinor };
}

export function isCommercialInventoryForProduct(
  productKind: DeliveryAdProductKey,
  inventoryKey: string
): boolean {
  const keys = DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT[productKind] as readonly string[];
  return keys.includes(inventoryKey);
}

/**
 * Canonical commercial calculator — single authority for store_sponsored + banner.
 * Client-supplied final amounts are ignored (not an input).
 */
export function calculateDeliveryAdCommercialQuote(
  input: DeliveryAdCommercialQuoteInput
): DeliveryAdCommercialQuote {
  const source: DeliveryAdCampaignSource = input.campaignSource ?? "OWNER_PAID";

  if (source === "DIBAY_FIRST_PARTY") {
    if (!isCommercialInventoryForProduct(input.productKind, input.inventoryKey)) {
      return { ok: false, error: "inventory_product_mismatch" };
    }
    if (!input.productEnabled) return { ok: false, error: "product_disabled" };
    return {
      ok: true,
      sellable: true,
      productKind: input.productKind,
      inventoryKey: input.inventoryKey,
      packageId: input.package.id,
      packageCode: input.package.code,
      packageDisplayName: input.package.displayName,
      durationDays: input.package.durationDays,
      basePriceMinor: 0,
      partnerMembershipId: null,
      partnerDiscountPercent: 0,
      partnerBenefitSnapshot: {},
      finalPayableMinor: 0,
      currency: input.package.currency || DELIVERY_AD_COMMERCIAL_CURRENCY_DEFAULT,
      campaignSource: "DIBAY_FIRST_PARTY",
      commercialStatus: "FIRST_PARTY_NO_CHARGE",
    };
  }

  if (!input.productEnabled) return { ok: false, error: "product_disabled" };
  if (!input.acceptingApplications) return { ok: false, error: "applications_paused" };
  if (!isCommercialInventoryForProduct(input.productKind, input.inventoryKey)) {
    return { ok: false, error: "inventory_product_mismatch" };
  }
  if (!input.placement || !input.placement.sellable) {
    return { ok: false, error: "placement_not_sellable" };
  }
  if (
    input.package.productKind !== input.productKind ||
    input.package.inventoryKey !== input.inventoryKey
  ) {
    return { ok: false, error: "inventory_product_mismatch" };
  }
  if (!input.package.enabled) return { ok: false, error: "package_disabled" };
  if (
    !Number.isInteger(input.package.durationDays) ||
    input.package.durationDays < 1
  ) {
    return { ok: false, error: "invalid_duration" };
  }
  if (
    input.package.priceAmountMinor == null ||
    !assertDeliveryAdMoneyMinor(input.package.priceAmountMinor) ||
    input.package.priceAmountMinor <= 0
  ) {
    return { ok: false, error: "price_not_configured" };
  }

  const discountPercent =
    input.partner.active && Number.isInteger(input.partner.advertisingDiscountPercent)
      ? Math.max(0, Math.min(100, input.partner.advertisingDiscountPercent))
      : 0;

  const discounted = applyPartnerAdvertisingDiscountMinor({
    basePriceMinor: input.package.priceAmountMinor,
    discountPercent,
  });
  if (!discounted.ok) return { ok: false, error: discounted.error };

  return {
    ok: true,
    sellable: true,
    productKind: input.productKind,
    inventoryKey: input.inventoryKey,
    packageId: input.package.id,
    packageCode: input.package.code,
    packageDisplayName: input.package.displayName,
    durationDays: input.package.durationDays,
    basePriceMinor: input.package.priceAmountMinor,
    partnerMembershipId: input.partner.active ? input.partner.membershipId : null,
    partnerDiscountPercent: discountPercent,
    partnerBenefitSnapshot: input.partner.active ? input.partner.benefitSnapshot : {},
    finalPayableMinor: discounted.finalPayableMinor,
    currency: input.package.currency || DELIVERY_AD_COMMERCIAL_CURRENCY_DEFAULT,
    campaignSource: "OWNER_PAID",
    commercialStatus: "PRICED",
  };
}

/**
 * Build immutable snapshot from quote. Catalog edits must not mutate stored rows.
 * Client finalPayable is never accepted as authority — only quote.finalPayableMinor.
 */
export function buildCampaignCommercialSnapshotFromQuote(input: {
  campaignId: string;
  quote: DeliveryAdCommercialQuoteOk;
  pricedAtIso?: string;
  /** Ignored — proves client amount is not authority */
  clientFinalPayableMinor?: number;
}): DeliveryAdCampaignCommercialSnapshot {
  void input.clientFinalPayableMinor;
  return {
    campaignId: input.campaignId,
    productKind: input.quote.productKind,
    campaignSource: input.quote.campaignSource,
    inventoryKey: input.quote.inventoryKey,
    packageId: input.quote.packageId,
    packageCode: input.quote.packageCode,
    packageDisplayName: input.quote.packageDisplayName,
    durationDaysSnapshot: input.quote.durationDays,
    basePriceMinorSnapshot: input.quote.basePriceMinor,
    partnerMembershipId: input.quote.partnerMembershipId,
    partnerDiscountPercentSnapshot: input.quote.partnerDiscountPercent,
    partnerBenefitSnapshot: input.quote.partnerBenefitSnapshot,
    finalPayableMinor: input.quote.finalPayableMinor,
    currency: input.quote.currency,
    pricedAt: input.pricedAtIso ?? new Date().toISOString(),
    commercialStatus: input.quote.commercialStatus,
  };
}

/**
 * After Admin catalog price change, existing snapshot rows must remain identical.
 * Pure contract helper for tests / writers.
 */
export function assertCampaignCommercialSnapshotImmutable(
  before: DeliveryAdCampaignCommercialSnapshot,
  afterCatalogEdit: DeliveryAdCampaignCommercialSnapshot
): boolean {
  return (
    before.finalPayableMinor === afterCatalogEdit.finalPayableMinor &&
    before.basePriceMinorSnapshot === afterCatalogEdit.basePriceMinorSnapshot &&
    before.durationDaysSnapshot === afterCatalogEdit.durationDaysSnapshot &&
    before.packageId === afterCatalogEdit.packageId &&
    before.currency === afterCatalogEdit.currency
  );
}

export type DeliveryAdExtensionQuoteInput = {
  policy: DeliveryAdExtensionPolicyRow;
  requestedDays: number;
  previousEndAtIso: string;
  partnerDiscountPercent?: number;
  extensionKind?: Extract<DeliveryAdExtensionKind, "PAID" | "ADMIN_FREE_COMPENSATION">;
};

export type DeliveryAdExtensionQuote =
  | {
      ok: true;
      extensionKind: DeliveryAdExtensionKind;
      daysAdded: number;
      unitPriceMinorSnapshot: number | null;
      partnerDiscountPercentSnapshot: number;
      finalExtensionAmountMinor: number;
      currency: string;
      previousEndAt: string;
      newEndAt: string;
    }
  | {
      ok: false;
      error:
        | "extension_disabled"
        | "day_price_not_configured"
        | "days_out_of_range"
        | "invalid_unit"
        | "invalid_end"
        | "invalid_discount";
    };

export function calculateDeliveryAdExtensionQuote(
  input: DeliveryAdExtensionQuoteInput
): DeliveryAdExtensionQuote {
  const kind = input.extensionKind ?? "PAID";
  const prev = Date.parse(input.previousEndAtIso);
  if (!Number.isFinite(prev)) return { ok: false, error: "invalid_end" };

  const days = input.requestedDays;
  if (!Number.isInteger(days) || days < 1) return { ok: false, error: "days_out_of_range" };

  const unit = input.policy.extensionUnitDays;
  if (!Number.isInteger(unit) || unit < 1) return { ok: false, error: "invalid_unit" };
  if (days % unit !== 0) return { ok: false, error: "invalid_unit" };
  if (
    days < input.policy.minimumExtensionDays ||
    days > input.policy.maximumExtensionDays
  ) {
    return { ok: false, error: "days_out_of_range" };
  }

  const newEnd = new Date(prev);
  newEnd.setUTCDate(newEnd.getUTCDate() + days);
  const newEndAt = newEnd.toISOString();

  if (kind === "ADMIN_FREE_COMPENSATION") {
    return {
      ok: true,
      extensionKind: "ADMIN_FREE_COMPENSATION",
      daysAdded: days,
      unitPriceMinorSnapshot: null,
      partnerDiscountPercentSnapshot: 0,
      finalExtensionAmountMinor: 0,
      currency: input.policy.currency || DELIVERY_AD_COMMERCIAL_CURRENCY_DEFAULT,
      previousEndAt: new Date(prev).toISOString(),
      newEndAt,
    };
  }

  if (!input.policy.extensionEnabled) return { ok: false, error: "extension_disabled" };
  if (
    input.policy.additionalDayPriceMinor == null ||
    !assertDeliveryAdMoneyMinor(input.policy.additionalDayPriceMinor)
  ) {
    return { ok: false, error: "day_price_not_configured" };
  }

  const base = input.policy.additionalDayPriceMinor * days;
  if (!assertDeliveryAdMoneyMinor(base)) return { ok: false, error: "day_price_not_configured" };

  const discountPercent = input.partnerDiscountPercent ?? 0;
  const discounted = applyPartnerAdvertisingDiscountMinor({
    basePriceMinor: base,
    discountPercent,
  });
  if (!discounted.ok) return { ok: false, error: "invalid_discount" };

  return {
    ok: true,
    extensionKind: "PAID",
    daysAdded: days,
    unitPriceMinorSnapshot: input.policy.additionalDayPriceMinor,
    partnerDiscountPercentSnapshot: discountPercent,
    finalExtensionAmountMinor: discounted.finalPayableMinor,
    currency: input.policy.currency || DELIVERY_AD_COMMERCIAL_CURRENCY_DEFAULT,
    previousEndAt: new Date(prev).toISOString(),
    newEndAt,
  };
}

/** Partner MUST NOT touch organic ranking — structural marker for tests. */
export const DELIVERY_AD_PARTNER_ORGANIC_EFFECT = {
  organicRankingBoost: false,
  organicInjection: false,
  bypassSponsoredLabel: false,
  altersOrganicEligibility: false,
} as const;

export function mapDeliveryAdPartnerMembershipRow(
  raw: Record<string, unknown>
): DeliveryAdPartnerMembershipRow | null {
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  const statusRaw = String(raw.status ?? "").trim();
  if (!id || !storeId) return null;
  if (!(DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES as readonly string[]).includes(statusRaw)) {
    return null;
  }
  const benefit =
    raw.benefit_snapshot && typeof raw.benefit_snapshot === "object"
      ? (raw.benefit_snapshot as Record<string, unknown>)
      : {};
  return {
    id,
    storeId,
    status: statusRaw as DeliveryAdPartnerMembershipStatus,
    periodStart: raw.period_start == null ? null : String(raw.period_start),
    periodEnd: raw.period_end == null ? null : String(raw.period_end),
    feeSnapshotMinor: raw.fee_snapshot_minor == null ? null : Number(raw.fee_snapshot_minor),
    currency: String(raw.currency ?? "PHP"),
    benefitSnapshot: benefit,
    advertisingDiscountPercentSnapshot: Number(
      raw.advertising_discount_percent_snapshot ?? 0
    ),
    configVersionSnapshot:
      raw.config_version_snapshot == null ? null : Number(raw.config_version_snapshot),
    cancelRequestedAt:
      raw.cancel_requested_at == null ? null : String(raw.cancel_requested_at),
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
  };
}

export function mapDeliveryAdPackageRow(raw: Record<string, unknown>): DeliveryAdPackageRow | null {
  const productKind = String(raw.product_kind ?? "");
  if (productKind !== "store_sponsored" && productKind !== "banner") return null;
  const id = String(raw.id ?? "").trim();
  const inventoryKey = String(raw.inventory_key ?? "").trim();
  const code = String(raw.code ?? "").trim();
  if (!id || !inventoryKey || !code) return null;
  const durationDays = Number(raw.duration_days);
  if (!Number.isInteger(durationDays) || durationDays < 1) return null;
  const priceRaw = raw.price_amount_minor;
  let priceAmountMinor: number | null = null;
  if (priceRaw != null) {
    const n = Number(priceRaw);
    if (!assertDeliveryAdMoneyMinor(n)) return null;
    priceAmountMinor = n;
  }
  return {
    id,
    productKind,
    inventoryKey,
    code,
    displayName: String(raw.display_name ?? code).trim() || code,
    durationDays,
    priceAmountMinor,
    currency: String(raw.currency ?? DELIVERY_AD_COMMERCIAL_CURRENCY_DEFAULT) || "PHP",
    enabled: raw.enabled === true,
    displayOrder: Number.isFinite(Number(raw.display_order))
      ? Math.floor(Number(raw.display_order))
      : 0,
  };
}

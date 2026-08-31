/**
 * P0-A — Commercial catalog read model for future Admin settings / Owner workspace.
 * No UI. Server recomputes quotes; never trusts client payable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE,
  DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT,
  DELIVERY_AD_EXTENSION_POLICY_TABLE,
  DELIVERY_AD_PACKAGE_TABLE,
  DELIVERY_AD_PARTNER_CONFIG_TABLE,
  DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE,
  DELIVERY_AD_PLACEMENT_COMMERCIAL_TABLE,
  calculateDeliveryAdCommercialQuote,
  mapDeliveryAdPackageRow,
  type DeliveryAdCampaignCommercialSnapshot,
  type DeliveryAdCommercialQuote,
  type DeliveryAdExtensionPolicyRow,
  type DeliveryAdPackageRow,
  type DeliveryAdPartnerConfigRow,
  type DeliveryAdPartnerMembershipEligibility,
  type DeliveryAdPlacementCommercialRow,
  buildCampaignCommercialSnapshotFromQuote,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import {
  DELIVERY_AD_PRODUCT_TABLE,
  type DeliveryAdProductKey,
  isDeliveryAdProductKey,
} from "@/lib/stores/advertising/delivery-ad-product-registry";

export type DeliveryAdCommercialCatalogReadModel = {
  products: Array<{
    key: DeliveryAdProductKey;
    displayName: string;
    description: string | null;
    enabled: boolean;
    acceptingApplications: boolean;
  }>;
  placements: DeliveryAdPlacementCommercialRow[];
  packages: DeliveryAdPackageRow[];
  extensionPolicy: DeliveryAdExtensionPolicyRow | null;
  partnerConfig: DeliveryAdPartnerConfigRow | null;
};

export async function loadDeliveryAdCommercialCatalog(
  sb: SupabaseClient
): Promise<DeliveryAdCommercialCatalogReadModel> {
  const [productsRes, placementsRes, packagesRes, extRes, partnerRes] = await Promise.all([
    sb.from(DELIVERY_AD_PRODUCT_TABLE).select(
      "key, display_name, description, is_active, accepting_applications"
    ),
    sb.from(DELIVERY_AD_PLACEMENT_COMMERCIAL_TABLE).select("*"),
    sb.from(DELIVERY_AD_PACKAGE_TABLE).select("*").order("display_order", { ascending: true }),
    sb.from(DELIVERY_AD_EXTENSION_POLICY_TABLE).select("*").eq("id", "default").maybeSingle(),
    sb.from(DELIVERY_AD_PARTNER_CONFIG_TABLE).select("*").eq("id", "default").maybeSingle(),
  ]);

  const products = (productsRes.data ?? [])
    .map((r) => {
      const key = String((r as { key?: string }).key ?? "");
      if (!isDeliveryAdProductKey(key)) return null;
      return {
        key,
        displayName: String((r as { display_name?: string }).display_name ?? key),
        description:
          (r as { description?: string | null }).description == null
            ? null
            : String((r as { description: string }).description),
        enabled: (r as { is_active?: boolean }).is_active !== false,
        acceptingApplications: (r as { accepting_applications?: boolean }).accepting_applications !== false,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p != null);

  const placements: DeliveryAdPlacementCommercialRow[] = (placementsRes.data ?? [])
    .map((r) => {
      const productKind = String((r as { product_kind?: string }).product_kind ?? "");
      if (!isDeliveryAdProductKey(productKind)) return null;
      return {
        productKind,
        inventoryKey: String((r as { inventory_key?: string }).inventory_key ?? ""),
        sellable: (r as { sellable?: boolean }).sellable === true,
      };
    })
    .filter((p): p is DeliveryAdPlacementCommercialRow => p != null && Boolean(p.inventoryKey));

  const packages = (packagesRes.data ?? [])
    .map((r) => mapDeliveryAdPackageRow(r as Record<string, unknown>))
    .filter((p): p is DeliveryAdPackageRow => p != null);

  const extensionPolicy = mapExtensionPolicy(extRes.data as Record<string, unknown> | null);
  const partnerConfig = mapPartnerConfig(partnerRes.data as Record<string, unknown> | null);

  return { products, placements, packages, extensionPolicy, partnerConfig };
}

function mapExtensionPolicy(raw: Record<string, unknown> | null): DeliveryAdExtensionPolicyRow | null {
  if (!raw) return null;
  return {
    extensionEnabled: raw.extension_enabled === true,
    additionalDayPriceMinor:
      raw.additional_day_price_minor == null ? null : Number(raw.additional_day_price_minor),
    currency: String(raw.currency ?? "PHP"),
    minimumExtensionDays: Number(raw.minimum_extension_days ?? 1),
    maximumExtensionDays: Number(raw.maximum_extension_days ?? 30),
    extensionUnitDays: Number(raw.extension_unit_days ?? 1),
  };
}

function mapPartnerConfig(raw: Record<string, unknown> | null): DeliveryAdPartnerConfigRow | null {
  if (!raw) return null;
  const benefit =
    raw.benefit_json && typeof raw.benefit_json === "object"
      ? (raw.benefit_json as Record<string, unknown>)
      : {};
  return {
    enabled: raw.enabled === true,
    monthlyFeeMinor: raw.monthly_fee_minor == null ? null : Number(raw.monthly_fee_minor),
    currency: String(raw.currency ?? "PHP"),
    advertisingDiscountPercent: Number(raw.advertising_discount_percent ?? 0),
    benefitJson: benefit,
    acceptingNewMembers: raw.accepting_new_members === true,
    version: Number(raw.version ?? 1),
  };
}

export async function loadActivePartnerMembershipForStore(
  sb: SupabaseClient,
  storeId: string,
  nowMs = Date.now()
): Promise<DeliveryAdPartnerMembershipEligibility> {
  const empty: DeliveryAdPartnerMembershipEligibility = {
    membershipId: null,
    active: false,
    advertisingDiscountPercent: 0,
    benefitSnapshot: {},
    status: null,
  };
  // ACTIVE + CANCEL_PENDING (해지 예정) keep discount in-period.
  // PENDING_REVIEW must never discount.
  const { data, error } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .select("*")
    .eq("store_id", storeId)
    .in("status", ["ACTIVE", "CANCEL_PENDING"])
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return empty;
  const status = String((data as { status?: string }).status ?? "");
  if (status !== "ACTIVE" && status !== "CANCEL_PENDING") return empty;
  const end = data.period_end ? Date.parse(String(data.period_end)) : NaN;
  const start = data.period_start ? Date.parse(String(data.period_start)) : NaN;
  if (!Number.isFinite(end) || end < nowMs) return empty;
  if (Number.isFinite(start) && start > nowMs) return empty;
  const benefit =
    data.benefit_snapshot && typeof data.benefit_snapshot === "object"
      ? (data.benefit_snapshot as Record<string, unknown>)
      : {};
  return {
    membershipId: String(data.id),
    active: true,
    advertisingDiscountPercent: Number(data.advertising_discount_percent_snapshot ?? 0),
    benefitSnapshot: benefit,
    status: status as "ACTIVE" | "CANCEL_PENDING",
  };
}

/**
 * Owner application commercial quote — server boundary.
 * Ignores any client-supplied final payable.
 */
export async function quoteDeliveryAdApplicationCommercial(
  sb: SupabaseClient,
  input: {
    productKind: DeliveryAdProductKey;
    inventoryKey: string;
    packageId: string;
    storeId: string;
    clientFinalPayableMinor?: number;
  }
): Promise<DeliveryAdCommercialQuote> {
  void input.clientFinalPayableMinor;
  const catalog = await loadDeliveryAdCommercialCatalog(sb);
  const product = catalog.products.find((p) => p.key === input.productKind);
  const pkg = catalog.packages.find((p) => p.id === input.packageId);
  const placement =
    catalog.placements.find(
      (p) => p.productKind === input.productKind && p.inventoryKey === input.inventoryKey
    ) ?? null;
  if (!product || !pkg) {
    return { ok: false, error: "package_disabled" };
  }
  const partner = await loadActivePartnerMembershipForStore(sb, input.storeId);
  return calculateDeliveryAdCommercialQuote({
    productKind: input.productKind,
    inventoryKey: input.inventoryKey,
    package: pkg,
    placement,
    productEnabled: product.enabled,
    acceptingApplications: product.acceptingApplications,
    partner,
    campaignSource: "OWNER_PAID",
  });
}

export async function insertCampaignCommercialSnapshot(
  sb: SupabaseClient,
  snapshot: DeliveryAdCampaignCommercialSnapshot
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.from(DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE).insert({
    campaign_id: snapshot.campaignId,
    product_kind: snapshot.productKind,
    campaign_source: snapshot.campaignSource,
    inventory_key: snapshot.inventoryKey,
    package_id: snapshot.packageId,
    package_code: snapshot.packageCode,
    package_display_name: snapshot.packageDisplayName,
    duration_days_snapshot: snapshot.durationDaysSnapshot,
    base_price_minor_snapshot: snapshot.basePriceMinorSnapshot,
    partner_membership_id: snapshot.partnerMembershipId,
    partner_discount_percent_snapshot: snapshot.partnerDiscountPercentSnapshot,
    partner_benefit_snapshot: snapshot.partnerBenefitSnapshot,
    final_payable_minor: snapshot.finalPayableMinor,
    currency: snapshot.currency,
    priced_at: snapshot.pricedAt,
    commercial_status: snapshot.commercialStatus,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function prepareOwnerPaidCampaignSnapshotFromQuote(input: {
  campaignId: string;
  quote: Extract<DeliveryAdCommercialQuote, { ok: true }>;
  clientFinalPayableMinor?: number;
}): DeliveryAdCampaignCommercialSnapshot {
  return buildCampaignCommercialSnapshotFromQuote({
    campaignId: input.campaignId,
    quote: input.quote,
    clientFinalPayableMinor: input.clientFinalPayableMinor,
  });
}

/** Owner single-workspace read: sellable packages with optional Partner-adjusted TOTAL. */
export function listSellablePackagesForOwnerWorkspace(input: {
  catalog: DeliveryAdCommercialCatalogReadModel;
  productKind: DeliveryAdProductKey;
  inventoryKey: string;
  partner: DeliveryAdPartnerMembershipEligibility;
}): Array<{
  package: DeliveryAdPackageRow;
  quote: DeliveryAdCommercialQuote;
}> {
  const product = input.catalog.products.find((p) => p.key === input.productKind);
  const placement =
    input.catalog.placements.find(
      (p) => p.productKind === input.productKind && p.inventoryKey === input.inventoryKey
    ) ?? null;
  if (!product) return [];
  const allowed = DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT[input.productKind] as readonly string[];
  if (!allowed.includes(input.inventoryKey)) return [];

  return input.catalog.packages
    .filter(
      (pkg) =>
        pkg.productKind === input.productKind && pkg.inventoryKey === input.inventoryKey
    )
    .map((pkg) => ({
      package: pkg,
      quote: calculateDeliveryAdCommercialQuote({
        productKind: input.productKind,
        inventoryKey: input.inventoryKey,
        package: pkg,
        placement,
        productEnabled: product.enabled,
        acceptingApplications: product.acceptingApplications,
        partner: input.partner,
      }),
    }));
}

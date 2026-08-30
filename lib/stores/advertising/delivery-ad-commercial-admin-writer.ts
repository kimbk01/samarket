/**
 * P0-A — Admin commercial catalog write authority (server).
 * Does NOT mutate existing campaign commercial snapshots when catalog prices change.
 * No UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_AD_COMMERCIAL_OVERRIDE_AUDIT_TABLE,
  DELIVERY_AD_EXTENSION_POLICY_TABLE,
  DELIVERY_AD_PACKAGE_TABLE,
  DELIVERY_AD_PARTNER_CONFIG_TABLE,
  DELIVERY_AD_PLACEMENT_COMMERCIAL_TABLE,
  type DeliveryAdPackageRow,
  mapDeliveryAdPackageRow,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { assertDeliveryAdMoneyMinor } from "@/lib/stores/advertising/delivery-ad-billing-contract";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";

export type DeliveryAdCommercialOverrideInput = {
  entityType:
    | "package"
    | "placement_commercial"
    | "product"
    | "extension_policy"
    | "partner_config"
    | "campaign_commercial"
    | "partner_membership";
  entityId: string;
  actorUserId: string;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export async function recordDeliveryAdCommercialOverride(
  sb: SupabaseClient,
  input: DeliveryAdCommercialOverrideInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason || !input.actorUserId) return { ok: false, error: "reason_required" };
  const { error } = await sb.from(DELIVERY_AD_COMMERCIAL_OVERRIDE_AUDIT_TABLE).insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    actor_user_id: input.actorUserId,
    reason,
    before_json: input.before,
    after_json: input.after,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function adminUpdateDeliveryAdPackagePrice(
  sb: SupabaseClient,
  input: {
    packageId: string;
    priceAmountMinor: number | null;
    enabled?: boolean;
    durationDays?: number;
    actorUserId: string;
    reason: string;
  }
): Promise<{ ok: true; package: DeliveryAdPackageRow } | { ok: false; error: string }> {
  if (
    input.priceAmountMinor != null &&
    (!assertDeliveryAdMoneyMinor(input.priceAmountMinor) || input.priceAmountMinor <= 0)
  ) {
    return { ok: false, error: "invalid_price" };
  }
  const { data: beforeRaw, error: loadErr } = await sb
    .from(DELIVERY_AD_PACKAGE_TABLE)
    .select("*")
    .eq("id", input.packageId)
    .maybeSingle();
  if (loadErr || !beforeRaw) return { ok: false, error: loadErr?.message ?? "not_found" };
  const before = mapDeliveryAdPackageRow(beforeRaw as Record<string, unknown>);
  if (!before) return { ok: false, error: "invalid_row" };

  const patch: Record<string, unknown> = {
    price_amount_minor: input.priceAmountMinor,
    updated_at: new Date().toISOString(),
  };
  if (input.enabled != null) patch.enabled = input.enabled;
  if (input.durationDays != null) {
    if (!Number.isInteger(input.durationDays) || input.durationDays < 1) {
      return { ok: false, error: "invalid_duration" };
    }
    patch.duration_days = input.durationDays;
  }

  const { data: afterRaw, error } = await sb
    .from(DELIVERY_AD_PACKAGE_TABLE)
    .update(patch)
    .eq("id", input.packageId)
    .select("*")
    .maybeSingle();
  if (error || !afterRaw) return { ok: false, error: error?.message ?? "update_failed" };
  const after = mapDeliveryAdPackageRow(afterRaw as Record<string, unknown>);
  if (!after) return { ok: false, error: "invalid_row" };

  const audit = await recordDeliveryAdCommercialOverride(sb, {
    entityType: "package",
    entityId: input.packageId,
    actorUserId: input.actorUserId,
    reason: input.reason,
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
  });
  if (!audit.ok) return audit;
  return { ok: true, package: after };
}

export async function adminUpdateDeliveryAdPartnerConfig(
  sb: SupabaseClient,
  input: {
    monthlyFeeMinor: number | null;
    advertisingDiscountPercent: number;
    enabled?: boolean;
    acceptingNewMembers?: boolean;
    actorUserId: string;
    reason: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    input.monthlyFeeMinor != null &&
    !assertDeliveryAdMoneyMinor(input.monthlyFeeMinor)
  ) {
    return { ok: false, error: "invalid_fee" };
  }
  if (
    !Number.isInteger(input.advertisingDiscountPercent) ||
    input.advertisingDiscountPercent < 0 ||
    input.advertisingDiscountPercent > 100
  ) {
    return { ok: false, error: "invalid_discount" };
  }

  const { data: before, error: loadErr } = await sb
    .from(DELIVERY_AD_PARTNER_CONFIG_TABLE)
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };

  const patch: Record<string, unknown> = {
    monthly_fee_minor: input.monthlyFeeMinor,
    advertising_discount_percent: input.advertisingDiscountPercent,
    updated_at: new Date().toISOString(),
  };
  if (input.enabled != null) patch.enabled = input.enabled;
  if (input.acceptingNewMembers != null) patch.accepting_new_members = input.acceptingNewMembers;
  if (before && typeof (before as { version?: number }).version === "number") {
    patch.version = Number((before as { version: number }).version) + 1;
  }

  const { data: after, error } = await sb
    .from(DELIVERY_AD_PARTNER_CONFIG_TABLE)
    .update(patch)
    .eq("id", "default")
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  return recordDeliveryAdCommercialOverride(sb, {
    entityType: "partner_config",
    entityId: "default",
    actorUserId: input.actorUserId,
    reason: input.reason,
    before: (before as Record<string, unknown>) ?? {},
    after: (after as Record<string, unknown>) ?? {},
  });
}

export async function adminUpdateDeliveryAdExtensionPolicy(
  sb: SupabaseClient,
  input: {
    extensionEnabled: boolean;
    additionalDayPriceMinor: number | null;
    minimumExtensionDays?: number;
    maximumExtensionDays?: number;
    actorUserId: string;
    reason: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    input.additionalDayPriceMinor != null &&
    !assertDeliveryAdMoneyMinor(input.additionalDayPriceMinor)
  ) {
    return { ok: false, error: "invalid_price" };
  }
  const { data: before } = await sb
    .from(DELIVERY_AD_EXTENSION_POLICY_TABLE)
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  const patch: Record<string, unknown> = {
    extension_enabled: input.extensionEnabled,
    additional_day_price_minor: input.additionalDayPriceMinor,
    updated_at: new Date().toISOString(),
  };
  if (input.minimumExtensionDays != null) patch.minimum_extension_days = input.minimumExtensionDays;
  if (input.maximumExtensionDays != null) patch.maximum_extension_days = input.maximumExtensionDays;

  const { data: after, error } = await sb
    .from(DELIVERY_AD_EXTENSION_POLICY_TABLE)
    .update(patch)
    .eq("id", "default")
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  return recordDeliveryAdCommercialOverride(sb, {
    entityType: "extension_policy",
    entityId: "default",
    actorUserId: input.actorUserId,
    reason: input.reason,
    before: (before as Record<string, unknown>) ?? {},
    after: (after as Record<string, unknown>) ?? {},
  });
}

export async function adminSetPlacementSellable(
  sb: SupabaseClient,
  input: {
    productKind: DeliveryAdProductKey;
    inventoryKey: string;
    sellable: boolean;
    actorUserId: string;
    reason: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: before } = await sb
    .from(DELIVERY_AD_PLACEMENT_COMMERCIAL_TABLE)
    .select("*")
    .eq("product_kind", input.productKind)
    .eq("inventory_key", input.inventoryKey)
    .maybeSingle();

  const { data: after, error } = await sb
    .from(DELIVERY_AD_PLACEMENT_COMMERCIAL_TABLE)
    .upsert(
      {
        product_kind: input.productKind,
        inventory_key: input.inventoryKey,
        sellable: input.sellable,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_kind,inventory_key" }
    )
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  return recordDeliveryAdCommercialOverride(sb, {
    entityType: "placement_commercial",
    entityId: `${input.productKind}:${input.inventoryKey}`,
    actorUserId: input.actorUserId,
    reason: input.reason,
    before: (before as Record<string, unknown>) ?? {},
    after: (after as Record<string, unknown>) ?? {},
  });
}

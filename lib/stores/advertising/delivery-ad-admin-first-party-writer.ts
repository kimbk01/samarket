/**
 * R4 — Admin DIBAY first-party Banner create (no fake Owner).
 * Store Promotion first-party: NOT_IMPLEMENTED_MODEL_BLOCKED (do not call).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/advertising/delivery-ad-domain";
import { DELIVERY_AD_AUDIT_LOG_TABLE } from "@/lib/stores/advertising/delivery-ad-audit";
import {
  DELIVERY_AD_INVENTORY_TABLE,
  inventorySeedByKey,
  isRuntimeActiveInventory,
  type DeliveryAdInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import {
  DELIVERY_AD_CREATIVE_TABLE,
  simplifyAspectRatio,
  isDeliveryAdCtaTarget,
  type DeliveryAdCtaTarget,
} from "@/lib/stores/advertising/delivery-ad-creative";
import {
  validateOwnerBannerCreativeAspect,
  validateOwnerBannerSchedule,
  resolveOwnerBannerCtaHref,
} from "@/lib/stores/advertising/owner-banner-contract";
import {
  insertCampaignCommercialSnapshot,
} from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import {
  buildCampaignCommercialSnapshotFromQuote,
  calculateDeliveryAdCommercialQuote,
  type DeliveryAdPackageRow,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import {
  R4_ADMIN_FIRST_PARTY_BANNER_CREATE_ENABLED,
  R4_STORE_PROMOTION_FIRST_PARTY,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { isDeliveryBannerDestinationReady } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import {
  BANNER_AD_DB_SURFACE,
  INVENTORY_KEY_TO_BANNER_DB_SURFACE,
} from "@/lib/stores/advertising/delivery-ad-placement";

const BANNER_JUNCTION = "delivery_banner_campaign_inventories" as const;

/**
 * Admin DIBAY first-party Banner inventories (QA / ops).
 * Owner sell remains HERO-only — do not use this for Owner purchase.
 * Stage 2 physical ACTIVE Banner inventories are included for fixture authority.
 */
export const ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS = [
  "STORES_HOME_HERO",
  "STORES_HOME_INLINE_1",
  "STORES_CATEGORY_TOP",
] as const satisfies ReadonlyArray<DeliveryAdInventoryKey>;

export type AdminFirstPartyBannerInventoryKey =
  (typeof ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS)[number];

export function validateAdminFirstPartyBannerInventory(
  raw: unknown
):
  | { ok: true; key: AdminFirstPartyBannerInventoryKey }
  | { ok: false; error: "no_inventory" | "invalid_inventory" | "future_inventory" } {
  if (raw == null || raw === "") return { ok: false, error: "no_inventory" };
  if (
    typeof raw !== "string" ||
    !(ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS as readonly string[]).includes(raw)
  ) {
    return { ok: false, error: "invalid_inventory" };
  }
  const key = raw as AdminFirstPartyBannerInventoryKey;
  if (!isRuntimeActiveInventory(key)) return { ok: false, error: "future_inventory" };
  return { ok: true, key };
}

export type AdminFirstPartyBannerCreateError =
  | "first_party_disabled"
  | "store_promotion_blocked"
  | "invalid_inventory"
  | "invalid_schedule"
  | "invalid_creative"
  | "invalid_destination"
  | "inventory_lookup_failed"
  | "db_error";

export type AdminFirstPartyBannerCreateInput = {
  actorUserId: string;
  inventoryKey: string;
  startAt: string;
  endAt: string;
  assetPath: string;
  sourceWidth: number;
  sourceHeight: number;
  headline?: string | null;
  subcopy?: string | null;
  /** Optional destination store — Owner is still null (no fake Owner). */
  destinationStoreId?: string | null;
  destinationStoreSlug?: string | null;
  ctaType?: DeliveryAdCtaTarget | null;
  ctaHref?: string | null;
  title?: string | null;
  reason?: string;
};

/**
 * Explicitly blocked — Store Promotion is store-bound Owner-paid only.
 * Do not invent a first-party store_sponsored writer.
 */
export function adminCreateDeliveryAdFirstPartyStoreSponsored(): {
  ok: false;
  error: "store_promotion_blocked";
  status: typeof R4_STORE_PROMOTION_FIRST_PARTY.status;
} {
  return {
    ok: false,
    error: "store_promotion_blocked",
    status: R4_STORE_PROMOTION_FIRST_PARTY.status,
  };
}

export async function adminCreateDeliveryAdFirstPartyBanner(
  sb: SupabaseClient,
  input: AdminFirstPartyBannerCreateInput
): Promise<
  | {
      ok: true;
      campaignId: string;
      creativeId: string;
      campaignSource: "DIBAY_FIRST_PARTY";
      lifecycleStatus: "SCHEDULED" | "ACTIVE";
    }
  | { ok: false; error: AdminFirstPartyBannerCreateError; detail?: string }
> {
  if (!R4_ADMIN_FIRST_PARTY_BANNER_CREATE_ENABLED) {
    return { ok: false, error: "first_party_disabled" };
  }

  const inv = validateAdminFirstPartyBannerInventory(input.inventoryKey);
  if (!inv.ok) return { ok: false, error: "invalid_inventory", detail: inv.error };

  const schedule = validateOwnerBannerSchedule({
    startAtIso: input.startAt,
    endAtIso: input.endAt,
  });
  if (!schedule.ok) return { ok: false, error: "invalid_schedule", detail: schedule.error };

  const assetPath = String(input.assetPath ?? "").trim();
  if (!assetPath) return { ok: false, error: "invalid_creative", detail: "empty_asset" };
  const aspect = validateOwnerBannerCreativeAspect({
    inventoryKey: inv.key,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
  });
  if (!aspect.ok) return { ok: false, error: "invalid_creative", detail: aspect.error };

  const destStoreId = input.destinationStoreId?.trim() || null;
  const destSlug = input.destinationStoreSlug?.trim() || null;
  let ctaHref = String(input.ctaHref ?? "").trim();
  const ctaType =
    input.ctaType && isDeliveryAdCtaTarget(input.ctaType) ? input.ctaType : null;

  if (destStoreId && destSlug && ctaType) {
    ctaHref = resolveOwnerBannerCtaHref({
      ctaType,
      storeSlug: destSlug,
    });
  }
  if (!isDeliveryBannerDestinationReady(ctaHref)) {
    return { ok: false, error: "invalid_destination", detail: "cta_href_required" };
  }

  const { data: invRow, error: invErr } = await sb
    .from(DELIVERY_AD_INVENTORY_TABLE)
    .select("id, key")
    .eq("key", inv.key)
    .eq("is_active", true)
    .maybeSingle();
  if (invErr || !invRow) {
    return { ok: false, error: "inventory_lookup_failed", detail: invErr?.message };
  }
  const inventoryId = String((invRow as { id: string }).id);

  const seed = inventorySeedByKey(inv.key);
  const aspectRatio = simplifyAspectRatio(input.sourceWidth, input.sourceHeight);
  const surface =
    INVENTORY_KEY_TO_BANNER_DB_SURFACE[inv.key] ?? BANNER_AD_DB_SURFACE;
  const nowMs = Date.now();
  const startMs = Date.parse(schedule.startAt);
  const endMs = Date.parse(schedule.endAt);
  const inWindow = startMs <= nowMs && endMs > nowMs;
  const lifecycleStatus: "SCHEDULED" | "ACTIVE" = inWindow ? "ACTIVE" : "SCHEDULED";
  const nowIso = new Date().toISOString();

  const { data: creative, error: creativeErr } = await sb
    .from(DELIVERY_AD_CREATIVE_TABLE)
    .insert({
      product_kind: "banner",
      owner_id: null,
      store_id: destStoreId,
      asset_path: assetPath,
      source_width: input.sourceWidth,
      source_height: input.sourceHeight,
      source_aspect_ratio: aspectRatio,
      headline: input.headline?.trim() || null,
      subcopy: input.subcopy?.trim() || null,
      cta_type: ctaType,
      cta_target_id: destStoreId,
      cta_label: null,
      review_status: "APPROVED",
      version: 1,
      created_by: input.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (creativeErr || !creative) {
    return { ok: false, error: "db_error", detail: creativeErr?.message };
  }
  const creativeId = String((creative as { id: string }).id);

  const { data: campaign, error: campErr } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .insert({
      surface,
      title: input.title?.trim() || input.headline?.trim() || null,
      subtitle: input.subcopy?.trim() || null,
      image_url: assetPath,
      cta_href: ctaHref,
      sort_order: 0,
      start_at: schedule.startAt,
      end_at: schedule.endAt,
      is_active: lifecycleStatus === "ACTIVE",
      product_key: "banner",
      owner_user_id: null,
      store_id: destStoreId,
      creative_id: creativeId,
      lifecycle_status: lifecycleStatus,
      review_status: "APPROVED",
      pricing_model: null,
      campaign_source: "DIBAY_FIRST_PARTY",
      submitted_at: nowIso,
      reviewed_at: nowIso,
      approved_at: nowIso,
      activated_at: lifecycleStatus === "ACTIVE" ? nowIso : null,
      created_by_user_id: input.actorUserId,
      updated_by_user_id: input.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (campErr || !campaign) {
    return { ok: false, error: "db_error", detail: campErr?.message };
  }
  const campaignId = String((campaign as { id: string }).id);

  const { error: junErr } = await sb.from(BANNER_JUNCTION).insert({
    campaign_id: campaignId,
    inventory_id: inventoryId,
    priority: 0,
  });
  if (junErr) {
    return { ok: false, error: "db_error", detail: junErr.message };
  }

  // Synthetic package row for first-party quote (FIRST_PARTY_NO_CHARGE).
  const syntheticPackage: DeliveryAdPackageRow = {
    id: "first-party-synthetic",
    productKind: "banner",
    inventoryKey: inv.key,
    code: "first_party",
    displayName: "DIBAY First-Party",
    durationDays: Math.max(
      1,
      Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000))
    ),
    priceAmountMinor: null,
    currency: "PHP",
    enabled: true,
    displayOrder: 0,
  };
  const quote = calculateDeliveryAdCommercialQuote({
    productKind: "banner",
    inventoryKey: inv.key,
    package: syntheticPackage,
    placement: { productKind: "banner", inventoryKey: inv.key, sellable: true },
    productEnabled: true,
    acceptingApplications: true,
    partner: {
      membershipId: null,
      active: false,
      advertisingDiscountPercent: 0,
      benefitSnapshot: {},
    },
    campaignSource: "DIBAY_FIRST_PARTY",
  });
  if (quote.ok) {
    const snapshot = buildCampaignCommercialSnapshotFromQuote({
      campaignId,
      quote,
    });
    // First-party has no sellable package row — never invent a package FK.
    snapshot.packageId = null;
    snapshot.packageCode = null;
    snapshot.packageDisplayName = null;
    await insertCampaignCommercialSnapshot(sb, snapshot);
  }

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: "banner",
    campaign_id: campaignId,
    actor_type: "admin",
    actor_user_id: input.actorUserId,
    action: "admin_first_party_banner_create",
    reason: input.reason?.trim() || "r4_first_party_create",
    after_json: {
      campaign_source: "DIBAY_FIRST_PARTY",
      inventory_key: inv.key,
      creative_id: creativeId,
      lifecycle_status: lifecycleStatus,
      owner_user_id: null,
      store_id: destStoreId,
      aspect: `${seed.aspectRatioWidth}:${seed.aspectRatioHeight}`,
    },
  });

  return {
    ok: true,
    campaignId,
    creativeId,
    campaignSource: "DIBAY_FIRST_PARTY",
    lifecycleStatus,
  };
}

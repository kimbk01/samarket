/**
 * CUT E — Owner Banner writer (service-role after ownership gate).
 * Mutations go through owner_delivery_banner_upsert RPC (atomic).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/advertising/delivery-ad-domain";
import {
  DELIVERY_AD_AUDIT_LOG_TABLE,
  canPhysicallyDeleteDeliveryAdCampaign,
  type DeliveryAdHistoryFlags,
} from "@/lib/stores/advertising/delivery-ad-audit";
import {
  assertDeliveryAdLifecycleTransition,
  lifecycleImpliesIsActive,
  type DeliveryAdLifecycleStatus,
  type DeliveryAdReviewStatus,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { DELIVERY_AD_CREATIVE_TABLE } from "@/lib/stores/advertising/delivery-ad-creative";
import { simplifyAspectRatio } from "@/lib/stores/advertising/delivery-ad-creative";
import {
  OWNER_BANNER_CTA_TARGET_TO_LABEL_KEY,
  OWNER_BANNER_PRICING,
  ownerBannerInventoryToLegacySurface,
  resolveOwnerBannerCtaHref,
  validateOwnerBannerCta,
  validateOwnerBannerCreativeAspect,
  validateOwnerBannerInventory,
  validateOwnerBannerSchedule,
  type OwnerBannerInventoryKey,
} from "@/lib/stores/advertising/owner-banner-contract";
import { assertOwnerStoreEligibleForAds } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import type { DeliveryAdCtaTarget } from "@/lib/stores/advertising/delivery-ad-creative";
import type { OwnerCampaignAction } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import { ownerActionTargetLifecycle } from "@/lib/stores/advertising/owner-store-sponsored-contract";

const BANNER_JUNCTION = "delivery_banner_campaign_inventories" as const;
const INVENTORY_TABLE = "delivery_ad_inventories" as const;

const SELECT_COLS = [
  "id",
  "surface",
  "title",
  "subtitle",
  "image_url",
  "cta_href",
  "sort_order",
  "start_at",
  "end_at",
  "is_active",
  "product_key",
  "owner_user_id",
  "store_id",
  "creative_id",
  "lifecycle_status",
  "review_status",
  "pricing_model",
  "review_notes",
  "owner_client_request_id",
  "submitted_at",
  "created_at",
  "updated_at",
].join(", ");

export type OwnerBannerCreativeSnapshot = {
  id: string;
  assetPath: string;
  sourceWidth: number | null;
  sourceHeight: number | null;
  headline: string | null;
  subcopy: string | null;
  ctaType: DeliveryAdCtaTarget | null;
  ctaTargetId: string | null;
  ctaLabel: string | null;
  reviewStatus: DeliveryAdReviewStatus;
  version: number;
  supersedesCreativeId: string | null;
};

export type OwnerBannerCampaignRow = {
  id: string;
  productKey: "banner";
  storeId: string;
  surface: string;
  title: string | null;
  subtitle: string | null;
  /** Compatibility mirror of creative asset — not write authority. */
  imageUrl: string;
  ctaHref: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
  ownerUserId: string | null;
  creativeId: string | null;
  lifecycleStatus: DeliveryAdLifecycleStatus;
  reviewStatus: DeliveryAdReviewStatus;
  pricingModel: string | null;
  reviewNotes: string | null;
  ownerClientRequestId: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  inventoryKeys: OwnerBannerInventoryKey[];
  creative: OwnerBannerCreativeSnapshot | null;
};

export type OwnerBannerWriterError =
  | "store_not_eligible"
  | "invalid_start_at"
  | "invalid_end_at"
  | "end_before_start"
  | "start_in_past"
  | "no_inventory"
  | "invalid_inventory"
  | "future_inventory"
  | "empty_asset_path"
  | "aspect_mismatch"
  | "invalid_dimensions"
  | "external_cta_forbidden"
  | "invalid_cta_type"
  | "cta_target_required"
  | "invalid_cta_target"
  | "campaign_not_found"
  | "creative_not_found"
  | "forbidden"
  | "not_editable"
  | "illegal_transition"
  | "delete_not_allowed"
  | "duplicate_submit"
  | "db_error"
  | "inventory_lookup_failed"
  | "store_slug_missing";

export type OwnerBannerWriterResult<T> =
  | { ok: true; row: T }
  | { ok: false; error: OwnerBannerWriterError };

function isLifecycle(v: unknown): v is DeliveryAdLifecycleStatus {
  return typeof v === "string" && v.length > 0;
}
function isReview(v: unknown): v is DeliveryAdReviewStatus {
  return typeof v === "string" && v.length > 0;
}

async function loadInventoryKeys(
  sb: SupabaseClient,
  campaignId: string
): Promise<OwnerBannerInventoryKey[]> {
  const { data: links } = await sb
    .from(BANNER_JUNCTION)
    .select("inventory_id")
    .eq("campaign_id", campaignId);
  if (!links?.length) return [];
  const ids = links.map((r) => String((r as { inventory_id: string }).inventory_id));
  const { data: invs } = await sb.from(INVENTORY_TABLE).select("key").in("id", ids);
  const keys: OwnerBannerInventoryKey[] = [];
  for (const row of invs ?? []) {
    if (String((row as { key?: string }).key) === "STORES_HOME_HERO") {
      keys.push("STORES_HOME_HERO");
    }
  }
  return keys;
}

async function loadCreative(
  sb: SupabaseClient,
  creativeId: string | null
): Promise<OwnerBannerCreativeSnapshot | null> {
  if (!creativeId) return null;
  const { data } = await sb
    .from(DELIVERY_AD_CREATIVE_TABLE)
    .select(
      "id, asset_path, source_width, source_height, headline, subcopy, cta_type, cta_target_id, cta_label, review_status, version, supersedes_creative_id"
    )
    .eq("id", creativeId)
    .maybeSingle();
  if (!data) return null;
  const raw = data as Record<string, unknown>;
  const ctaType = raw.cta_type;
  return {
    id: String(raw.id),
    assetPath: String(raw.asset_path ?? ""),
    sourceWidth: raw.source_width == null ? null : Number(raw.source_width),
    sourceHeight: raw.source_height == null ? null : Number(raw.source_height),
    headline: raw.headline == null ? null : String(raw.headline),
    subcopy: raw.subcopy == null ? null : String(raw.subcopy),
    ctaType:
      ctaType === "store_detail" || ctaType === "store_menu" || ctaType === "store_promotion"
        ? ctaType
        : null,
    ctaTargetId: raw.cta_target_id == null ? null : String(raw.cta_target_id),
    ctaLabel: raw.cta_label == null ? null : String(raw.cta_label),
    reviewStatus: isReview(raw.review_status) ? raw.review_status : "NOT_SUBMITTED",
    version: Number(raw.version) || 1,
    supersedesCreativeId:
      raw.supersedes_creative_id == null ? null : String(raw.supersedes_creative_id),
  };
}

function mapRow(
  raw: Record<string, unknown>,
  inventoryKeys: OwnerBannerInventoryKey[],
  creative: OwnerBannerCreativeSnapshot | null
): OwnerBannerCampaignRow | null {
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  if (!id || !storeId || !isLifecycle(raw.lifecycle_status) || !isReview(raw.review_status)) {
    return null;
  }
  return {
    id,
    productKey: "banner",
    storeId,
    surface: String(raw.surface ?? ""),
    title: raw.title == null ? null : String(raw.title),
    subtitle: raw.subtitle == null ? null : String(raw.subtitle),
    imageUrl: String(raw.image_url ?? ""),
    ctaHref: String(raw.cta_href ?? ""),
    startAt: String(raw.start_at ?? ""),
    endAt: String(raw.end_at ?? ""),
    isActive: raw.is_active === true,
    ownerUserId: raw.owner_user_id == null ? null : String(raw.owner_user_id),
    creativeId: raw.creative_id == null ? null : String(raw.creative_id),
    lifecycleStatus: raw.lifecycle_status,
    reviewStatus: raw.review_status,
    pricingModel: raw.pricing_model == null ? null : String(raw.pricing_model),
    reviewNotes: raw.review_notes == null ? null : String(raw.review_notes),
    ownerClientRequestId:
      raw.owner_client_request_id == null ? null : String(raw.owner_client_request_id),
    submittedAt: raw.submitted_at == null ? null : String(raw.submitted_at),
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
    inventoryKeys,
    creative,
  };
}

async function hydrate(
  sb: SupabaseClient,
  raw: Record<string, unknown>
): Promise<OwnerBannerCampaignRow | null> {
  const id = String(raw.id ?? "");
  const keys = id ? await loadInventoryKeys(sb, id) : [];
  const creative = await loadCreative(
    sb,
    raw.creative_id == null ? null : String(raw.creative_id)
  );
  return mapRow(raw, keys, creative);
}

async function resolveStoreSlug(
  sb: SupabaseClient,
  storeId: string
): Promise<string | null> {
  const { data } = await sb.from("stores").select("slug").eq("id", storeId).maybeSingle();
  const slug = String((data as { slug?: string } | null)?.slug ?? "").trim();
  return slug || null;
}

export async function loadOwnerBannerCampaign(
  sb: SupabaseClient,
  campaignId: string,
  ownerUserId: string
): Promise<OwnerBannerWriterResult<OwnerBannerCampaignRow>> {
  const { data, error } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .select(SELECT_COLS)
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "campaign_not_found" };
  const raw = data as unknown as Record<string, unknown>;
  if (String(raw.owner_user_id ?? "") !== ownerUserId) return { ok: false, error: "forbidden" };
  const mapped = await hydrate(sb, raw);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

export async function listOwnerBannerCampaignsForStores(
  sb: SupabaseClient,
  ownerUserId: string,
  storeIds: string[]
): Promise<OwnerBannerCampaignRow[]> {
  if (!storeIds.length) return [];
  const { data, error } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .select(SELECT_COLS)
    .eq("owner_user_id", ownerUserId)
    .in("store_id", storeIds)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const out: OwnerBannerCampaignRow[] = [];
  for (const raw of data as unknown as Record<string, unknown>[]) {
    const mapped = await hydrate(sb, raw);
    if (mapped) out.push(mapped);
  }
  return out;
}

export type OwnerBannerUpsertInput = {
  storeId: string;
  ownerUserId: string;
  campaignId?: string | null;
  inventoryKey: unknown;
  assetPath: string;
  sourceWidth: number;
  sourceHeight: number;
  headline?: string | null;
  subcopy?: string | null;
  ctaType: unknown;
  /** Must equal storeId for Owner applications. */
  ctaTargetId?: unknown;
  startAtIso: string;
  endAtIso: string;
  clientRequestId?: string | null;
  supersedeCreativeId?: string | null;
  nowMs?: number;
};

export async function upsertOwnerBannerDraft(
  sb: SupabaseClient,
  input: OwnerBannerUpsertInput
): Promise<OwnerBannerWriterResult<OwnerBannerCampaignRow>> {
  void OWNER_BANNER_PRICING;
  const eligible = await assertOwnerStoreEligibleForAds(sb, input.storeId);
  if (!eligible.ok) return eligible;

  const inv = validateOwnerBannerInventory(input.inventoryKey);
  if (!inv.ok) return { ok: false, error: inv.error };

  const aspect = validateOwnerBannerCreativeAspect({
    inventoryKey: inv.key,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
  });
  if (!aspect.ok) return { ok: false, error: aspect.error };

  const assetPath = String(input.assetPath ?? "").trim();
  if (!assetPath) return { ok: false, error: "empty_asset_path" };
  if (/^https?:\/\//i.test(assetPath) === false && !assetPath.includes("/")) {
    // allow storage path or public URL
  }

  const cta = validateOwnerBannerCta({
    ctaType: input.ctaType,
    ctaTargetId: input.ctaTargetId ?? input.storeId,
  });
  if (!cta.ok) return { ok: false, error: cta.error };
  if (cta.ctaTargetId !== input.storeId) return { ok: false, error: "invalid_cta_target" };

  const schedule = validateOwnerBannerSchedule({
    startAtIso: input.startAtIso,
    endAtIso: input.endAtIso,
    nowMs: input.nowMs,
  });
  if (!schedule.ok) return { ok: false, error: schedule.error };

  const slug = await resolveStoreSlug(sb, input.storeId);
  if (!slug) return { ok: false, error: "store_slug_missing" };
  const ctaHref = resolveOwnerBannerCtaHref({ ctaType: cta.ctaType, storeSlug: slug });
  const ctaLabelKey = OWNER_BANNER_CTA_TARGET_TO_LABEL_KEY[cta.ctaType];

  void ownerBannerInventoryToLegacySurface(inv.key);

  const { data, error } = await sb.rpc("owner_delivery_banner_upsert", {
    p_owner_user_id: input.ownerUserId,
    p_store_id: input.storeId,
    p_campaign_id: input.campaignId?.trim() || null,
    p_inventory_key: inv.key,
    p_asset_path: assetPath,
    p_source_width: input.sourceWidth,
    p_source_height: input.sourceHeight,
    p_source_aspect_ratio: simplifyAspectRatio(input.sourceWidth, input.sourceHeight),
    p_headline: input.headline ?? null,
    p_subcopy: input.subcopy ?? null,
    p_cta_type: cta.ctaType,
    p_cta_target_id: input.storeId,
    p_cta_label: ctaLabelKey,
    p_cta_href: ctaHref,
    p_start_at: schedule.startAt,
    p_end_at: schedule.endAt,
    p_client_request_id: input.clientRequestId?.trim() || null,
    p_supersede_creative_id: input.supersedeCreativeId?.trim() || null,
  });

  if (error) {
    console.error("[owner_delivery_banner_upsert]", error.message);
    return { ok: false, error: "db_error" };
  }

  const payload = data as { ok?: boolean; error?: string; campaign_id?: string } | null;
  if (!payload?.ok || !payload.campaign_id) {
    const err = (payload?.error ?? "db_error") as OwnerBannerWriterError;
    return { ok: false, error: err };
  }

  return loadOwnerBannerCampaign(sb, payload.campaign_id, input.ownerUserId);
}

export async function transitionOwnerBannerCampaign(
  sb: SupabaseClient,
  input: {
    campaignId: string;
    ownerUserId: string;
    action: OwnerCampaignAction;
  }
): Promise<OwnerBannerWriterResult<OwnerBannerCampaignRow>> {
  const loaded = await loadOwnerBannerCampaign(sb, input.campaignId, input.ownerUserId);
  if (!loaded.ok) return loaded;
  const row = loaded.row;

  if (input.action === "resume" && row.lifecycleStatus === "PAUSED_ADMIN") {
    return { ok: false, error: "illegal_transition" };
  }

  const target = ownerActionTargetLifecycle(input.action);
  if (!target) return { ok: false, error: "illegal_transition" };

  const asserted = assertDeliveryAdLifecycleTransition(
    row.lifecycleStatus,
    target,
    "owner"
  );
  if (!asserted.ok) return { ok: false, error: "illegal_transition" };

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    lifecycle_status: target,
    is_active: lifecycleImpliesIsActive(target),
    updated_by_user_id: input.ownerUserId,
    updated_at: nowIso,
  };

  if (input.action === "submit" || input.action === "resubmit") {
    patch.review_status = "PENDING";
    patch.submitted_at = nowIso;
    if (row.creativeId) {
      await sb
        .from(DELIVERY_AD_CREATIVE_TABLE)
        .update({ review_status: "PENDING", updated_at: nowIso })
        .eq("id", row.creativeId);
    }
  }
  if (input.action === "pause") patch.paused_at = nowIso;
  if (input.action === "end") patch.ended_at = nowIso;

  const { error } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .update(patch)
    .eq("id", row.id)
    .eq("owner_user_id", input.ownerUserId);
  if (error) return { ok: false, error: "db_error" };

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: "banner",
    campaign_id: row.id,
    actor_type: "owner",
    actor_user_id: input.ownerUserId,
    action: `owner_banner_${input.action}`,
    before_json: { lifecycle: row.lifecycleStatus },
    after_json: { lifecycle: target },
  });

  return loadOwnerBannerCampaign(sb, row.id, input.ownerUserId);
}

export async function deleteOwnerBannerDraft(
  sb: SupabaseClient,
  input: { campaignId: string; ownerUserId: string }
): Promise<OwnerBannerWriterResult<{ id: string }>> {
  const loaded = await loadOwnerBannerCampaign(sb, input.campaignId, input.ownerUserId);
  if (!loaded.ok) return loaded;
  const history: DeliveryAdHistoryFlags = {
    hasImpression: false,
    hasClick: false,
    hasAttribution: false,
    hasBilling: false,
    hasFinancialHistory: false,
    hasAuditHistory: false,
  };
  if (
    !canPhysicallyDeleteDeliveryAdCampaign({
      lifecycleStatus: loaded.row.lifecycleStatus,
      history,
    })
  ) {
    return { ok: false, error: "delete_not_allowed" };
  }

  const { data: audits } = await sb
    .from(DELIVERY_AD_AUDIT_LOG_TABLE)
    .select("action")
    .eq("campaign_id", loaded.row.id)
    .eq("product_kind", "banner");
  const blocking = (audits ?? []).some((a) => {
    const action = String((a as { action?: string }).action ?? "");
    return (
      action &&
      !action.startsWith("owner_banner_create_draft") &&
      !action.startsWith("owner_banner_update_draft") &&
      !action.startsWith("draft_")
    );
  });
  if (blocking) return { ok: false, error: "delete_not_allowed" };

  const creativeId = loaded.row.creativeId;
  const { error } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .delete()
    .eq("id", loaded.row.id)
    .eq("owner_user_id", input.ownerUserId);
  if (error) return { ok: false, error: "db_error" };
  if (creativeId) {
    await sb.from(DELIVERY_AD_CREATIVE_TABLE).delete().eq("id", creativeId);
  }
  return { ok: true, row: { id: loaded.row.id } };
}

export const CUT_E_BANNER_TRANSACTIONAL_MUTATION = {
  status: "HARDENED" as const,
  rpc: "owner_delivery_banner_upsert",
};

export const CUT_C_SPONSORED_ATOMICITY = {
  status: "HARDENED" as const,
  rpc: "owner_delivery_sponsored_upsert",
  note: "create/update draft now uses RPC; lifecycle transitions remain single-row + audit",
};

/**
 * CUT F — Admin Delivery Ads mutation writer (service-role → admin_delivery_ad_transition).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminActionAllowed,
  adminActionAuditLabel,
  adminActionRequiresReason,
  isAdminDeliveryAdAction,
  isAdminDeliveryAdProduct,
  resolveApprovedGoLiveStatus,
  validateAdminDeliveryAdSchedule,
  type AdminDeliveryAdAction,
  type AdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
import {
  BANNER_AD_DB_SURFACE,
  INVENTORY_KEY_TO_BANNER_DB_SURFACE,
} from "@/lib/stores/advertising/delivery-ad-placement";
import {
  DELIVERY_AD_AUDIT_LOG_TABLE,
  canPhysicallyDeleteDeliveryAdCampaign,
  type DeliveryAdHistoryFlags,
} from "@/lib/stores/advertising/delivery-ad-audit";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import {
  validateOwnerBannerInventory,
  validateOwnerBannerCreativeAspect,
  validateOwnerBannerCta,
  resolveOwnerBannerCtaHref,
  OWNER_BANNER_CTA_TARGET_TO_LABEL_KEY,
} from "@/lib/stores/advertising/owner-banner-contract";
import { validateOwnerInventorySelection } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import { simplifyAspectRatio } from "@/lib/stores/advertising/delivery-ad-creative";
import { safeFanOutDeliveryAdLifecycleAudit } from "@/lib/stores/advertising/delivery-ad-operations-lifecycle-fanout";
import {
  evaluateDeliveryBannerPublishReadiness,
  isDeliveryBannerDestinationReady,
} from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import { OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";

export const CUT_F_ADMIN_TRANSACTIONAL_MUTATION = {
  authority: "admin_delivery_ad_transition",
  sequentialCompensationForbidden: true,
  legacyAdminWriters: "disabled_mutation",
} as const;

export type AdminDeliveryAdWriterError =
  | "forbidden"
  | "invalid_product"
  | "invalid_action"
  | "campaign_not_found"
  | "illegal_transition"
  | "reason_required"
  | "stale_lifecycle"
  | "stale_updated_at"
  | "delete_not_allowed"
  | "invalid_schedule"
  | "invalid_inventory"
  | "future_inventory"
  | "creative_not_ready"
  | "destination_not_ready"
  | "funding_required"
  | "use_extension_flow"
  | "capacity_full"
  | "db_error"
  | "rpc_failed";

export type AdminTransitionResult =
  | {
      ok: true;
      campaignId: string;
      from: DeliveryAdLifecycleStatus;
      to: DeliveryAdLifecycleStatus;
      action: AdminDeliveryAdAction;
      /** Present for lifecycle RPC transitions (CUT 3-B fan-out). Absent for delete_safe_draft. */
      auditId?: string;
    }
  | { ok: false; error: AdminDeliveryAdWriterError; detail?: string };

function tableFor(product: AdminDeliveryAdProduct): string {
  return product === "banner" ? BANNER_AD_CAMPAIGN_TABLE : STORE_SPONSORED_CAMPAIGN_TABLE;
}

function mapRpcError(raw: unknown): AdminDeliveryAdWriterError {
  const e = typeof raw === "string" ? raw : "";
  if (
    e === "forbidden" ||
    e === "invalid_product" ||
    e === "invalid_action" ||
    e === "campaign_not_found" ||
    e === "illegal_transition" ||
    e === "reason_required" ||
    e === "stale_lifecycle" ||
    e === "stale_updated_at" ||
    e === "creative_not_ready" ||
    e === "destination_not_ready" ||
    e === "funding_required" ||
    e === "db_error"
  ) {
    return e;
  }
  return "rpc_failed";
}

async function loadBannerPublishGate(
  sb: SupabaseClient,
  campaignId: string
): Promise<
  | { ok: true }
  | { ok: false; error: AdminDeliveryAdWriterError; detail?: string }
> {
  const { data: row, error } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .select("id, image_url, cta_href, creative_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) return { ok: false, error: "db_error", detail: error.message };
  if (!row) return { ok: false, error: "campaign_not_found" };

  let assetPath = String((row as { image_url?: string }).image_url ?? "").trim();
  const creativeId = (row as { creative_id?: string | null }).creative_id;
  if (creativeId) {
    const { data: creative } = await sb
      .from("delivery_ad_creatives")
      .select("asset_path")
      .eq("id", String(creativeId))
      .maybeSingle();
    const fromCreative = String(
      (creative as { asset_path?: string } | null)?.asset_path ?? ""
    ).trim();
    if (fromCreative) assetPath = fromCreative;
  }

  const readiness = evaluateDeliveryBannerPublishReadiness({
    creativeAssetPath: assetPath,
    ctaHref: (row as { cta_href?: string | null }).cta_href,
  });
  if (!readiness.creativeReady) {
    return {
      ok: false,
      error: "creative_not_ready",
      detail: readiness.reasons.join(","),
    };
  }
  if (!readiness.destinationReady) {
    return {
      ok: false,
      error: "destination_not_ready",
      detail: readiness.reasons.join(","),
    };
  }
  return { ok: true };
}

async function loadBannerInventoryKeys(
  sb: SupabaseClient,
  campaignId: string
): Promise<string[]> {
  const { data: links } = await sb
    .from("delivery_banner_campaign_inventories")
    .select("inventory_id, delivery_ad_inventories(key)")
    .eq("campaign_id", campaignId);
  const keys: string[] = [];
  for (const row of (links ?? []) as Record<string, unknown>[]) {
    const inv = row.delivery_ad_inventories as { key?: string } | { key?: string }[] | null;
    const key = Array.isArray(inv) ? inv[0]?.key : inv?.key;
    if (key && !keys.includes(String(key))) keys.push(String(key));
  }
  return keys;
}

export async function adminTransitionDeliveryAdCampaign(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    productKind: AdminDeliveryAdProduct;
    campaignId: string;
    action: AdminDeliveryAdAction;
    expectedLifecycle: DeliveryAdLifecycleStatus;
    expectedUpdatedAt: string;
    reason?: string | null;
    ownerVisibleNotes?: string | null;
  }
): Promise<AdminTransitionResult> {
  if (!isAdminDeliveryAdProduct(input.productKind)) {
    return { ok: false, error: "invalid_product" };
  }
  if (!isAdminDeliveryAdAction(input.action) || input.action === "delete_safe_draft") {
    return { ok: false, error: "invalid_action" };
  }
  if (!adminActionAllowed(input.action, input.expectedLifecycle)) {
    return { ok: false, error: "illegal_transition" };
  }
  if (adminActionRequiresReason(input.action) && !String(input.reason ?? "").trim()) {
    return { ok: false, error: "reason_required" };
  }

  if (input.productKind === "banner" && input.action === "approve") {
    const gate = await loadBannerPublishGate(sb, input.campaignId);
    if (!gate.ok) return gate;
    const { data: sched } = await sb
      .from(tableFor("banner"))
      .select("id, start_at, end_at")
      .eq("id", input.campaignId)
      .maybeSingle();
    if (sched?.start_at && sched?.end_at) {
      const { assertDeliveryHeroCapacityAvailable } = await import(
        "@/lib/admin/ads-exposure/capacity-gate"
      );
      const cap = await assertDeliveryHeroCapacityAvailable(sb, {
        startAt: String(sched.start_at),
        endAt: String(sched.end_at),
        excludeCampaignId: input.campaignId,
        inventoryKey: "STORES_HOME_HERO",
      });
      if (!cap.ok) {
        return {
          ok: false,
          error: "capacity_full",
          detail: cap.messageKo,
        };
      }
    }
  }

  const { data, error } = await sb.rpc("admin_delivery_ad_transition", {
    p_admin_user_id: input.adminUserId,
    p_product_kind: input.productKind,
    p_campaign_id: input.campaignId,
    p_action: input.action,
    p_expected_lifecycle: input.expectedLifecycle,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_reason: input.reason?.trim() || null,
    p_owner_visible_notes: input.ownerVisibleNotes?.trim() || input.reason?.trim() || null,
  });

  if (error) {
    return { ok: false, error: "rpc_failed", detail: error.message };
  }
  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      error: mapRpcError(payload?.error),
      detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    };
  }

  const auditId = typeof payload.audit_id === "string" ? payload.audit_id : null;
  if (!auditId) {
    return { ok: false, error: "db_error", detail: "missing_audit_id" };
  }

  // CUT 3-B — after durable audit; fan-out failure must not imply campaign rollback
  await safeFanOutDeliveryAdLifecycleAudit(sb, auditId);

  // Terminal REJECT refunds canonical Cash exactly once (not on request_changes).
  if (input.action === "reject") {
    const productKind = input.productKind === "banner" ? "banner" : "store_sponsored";
    const { refundBusinessCashForRejectedDeliveryAd } = await import(
      "@/lib/stores/advertising/canonical-business-cash-writer"
    );
    const bcRefund = await refundBusinessCashForRejectedDeliveryAd(sb, {
      adminUserId: input.adminUserId,
      applicationId: input.campaignId,
      productKind,
    });
    if (!bcRefund.ok && bcRefund.error !== "funding_not_found") {
      console.error(
        "[adminTransitionDeliveryAdCampaign] business_cash_refund",
        bcRefund.error,
        bcRefund.detail ?? ""
      );
    }
  }

  return {
    ok: true,
    campaignId: String(payload.campaign_id),
    from: String(payload.from) as DeliveryAdLifecycleStatus,
    to: String(payload.to) as DeliveryAdLifecycleStatus,
    action: input.action,
    auditId,
  };
}

export async function adminDeleteSafeDraftDeliveryAdCampaign(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    productKind: AdminDeliveryAdProduct;
    campaignId: string;
    expectedLifecycle: DeliveryAdLifecycleStatus;
    expectedUpdatedAt: string;
    history: DeliveryAdHistoryFlags;
  }
): Promise<AdminTransitionResult> {
  if (!canPhysicallyDeleteDeliveryAdCampaign({
    lifecycleStatus: input.expectedLifecycle,
    history: input.history,
  })) {
    return { ok: false, error: "delete_not_allowed" };
  }

  const table = tableFor(input.productKind);
  const { data: row, error: loadErr } = await sb
    .from(table)
    .select("id, lifecycle_status, updated_at")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: "db_error", detail: loadErr.message };
  if (!row) return { ok: false, error: "campaign_not_found" };
  if (String(row.lifecycle_status) !== input.expectedLifecycle) {
    return { ok: false, error: "stale_lifecycle" };
  }
  if (String(row.updated_at) !== input.expectedUpdatedAt) {
    return { ok: false, error: "stale_updated_at" };
  }

  if (input.productKind === "banner") {
    await sb.from("delivery_banner_campaign_inventories").delete().eq("campaign_id", input.campaignId);
  } else {
    await sb
      .from("delivery_store_sponsored_campaign_inventories")
      .delete()
      .eq("campaign_id", input.campaignId);
  }

  const { error: delErr } = await sb.from(table).delete().eq("id", input.campaignId);
  if (delErr) return { ok: false, error: "db_error", detail: delErr.message };

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: input.productKind,
    campaign_id: input.campaignId,
    actor_type: "admin",
    actor_user_id: input.adminUserId,
    action: adminActionAuditLabel("delete_safe_draft"),
    before_json: { lifecycle: input.expectedLifecycle },
    after_json: { deleted: true },
    reason: null,
  });

  return {
    ok: true,
    campaignId: input.campaignId,
    from: input.expectedLifecycle,
    to: input.expectedLifecycle,
    action: "delete_safe_draft",
  };
}

/** Admin schedule edit (operational). Review-affecting if campaign already approved+. */
export async function adminUpdateDeliveryAdSchedule(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    productKind: AdminDeliveryAdProduct;
    campaignId: string;
    expectedUpdatedAt: string;
    startAt: string;
    endAt: string;
    reason?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: AdminDeliveryAdWriterError; detail?: string }> {
  const schedule = validateAdminDeliveryAdSchedule({
    startAtIso: input.startAt,
    endAtIso: input.endAt,
  });
  if (!schedule.ok) {
    return { ok: false, error: "invalid_schedule", detail: schedule.error };
  }

  const table = tableFor(input.productKind);
  const { data: row, error: loadErr } = await sb
    .from(table)
    .select("id, lifecycle_status, start_at, end_at, updated_at")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: "db_error", detail: loadErr.message };
  if (!row) return { ok: false, error: "campaign_not_found" };
  if (String(row.updated_at) !== input.expectedUpdatedAt) {
    return { ok: false, error: "stale_updated_at" };
  }

  const prevEndMs = row.end_at ? Date.parse(String(row.end_at)) : NaN;
  const nextEndMs = Date.parse(schedule.endAt);
  const life = String(row.lifecycle_status ?? "");
  const extendableLife =
    life === "ACTIVE" ||
    life === "SCHEDULED" ||
    life === "PAUSED_OWNER" ||
    life === "PAUSED_ADMIN" ||
    life === "APPROVED";
  if (
    extendableLife &&
    Number.isFinite(prevEndMs) &&
    Number.isFinite(nextEndMs) &&
    nextEndMs > prevEndMs
  ) {
    return {
      ok: false,
      error: "use_extension_flow",
      detail:
        "Extending end_at requires Admin extension (PAID or compensation) — not schedule save.",
    };
  }

  if (input.productKind === "banner") {
    const { assertDeliveryHeroCapacityAvailable } = await import(
      "@/lib/admin/ads-exposure/capacity-gate"
    );
    const cap = await assertDeliveryHeroCapacityAvailable(sb, {
      startAt: schedule.startAt,
      endAt: schedule.endAt,
      excludeCampaignId: input.campaignId,
      inventoryKey: "STORES_HOME_HERO",
    });
    if (!cap.ok) {
      return { ok: false, error: "capacity_full", detail: cap.messageKo };
    }
  }

  const { error: updErr } = await sb
    .from(table)
    .update({
      start_at: schedule.startAt,
      end_at: schedule.endAt,
      updated_by_user_id: input.adminUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.campaignId)
    .eq("updated_at", input.expectedUpdatedAt);
  if (updErr) return { ok: false, error: "db_error", detail: updErr.message };

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: input.productKind,
    campaign_id: input.campaignId,
    actor_type: "admin",
    actor_user_id: input.adminUserId,
    action: "updated",
    reason: input.reason?.trim() || null,
    before_json: { start_at: row.start_at, end_at: row.end_at },
    after_json: { start_at: schedule.startAt, end_at: schedule.endAt, field: "schedule" },
  });

  return { ok: true };
}

export async function adminUpdateDeliveryAdInventory(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    productKind: AdminDeliveryAdProduct;
    campaignId: string;
    expectedUpdatedAt: string;
    inventoryKey: string;
    reason?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: AdminDeliveryAdWriterError; detail?: string }> {
  if (input.productKind === "banner") {
    const v = validateOwnerBannerInventory(input.inventoryKey);
    if (!v.ok) {
      return {
        ok: false,
        error: v.error === "future_inventory" ? "future_inventory" : "invalid_inventory",
      };
    }
  } else {
    const v = validateOwnerInventorySelection([input.inventoryKey]);
    if (!v.ok) {
      return { ok: false, error: "invalid_inventory" };
    }
  }

  const table = tableFor(input.productKind);
  const { data: row, error: loadErr } = await sb
    .from(table)
    .select("id, updated_at")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: "db_error", detail: loadErr.message };
  if (!row) return { ok: false, error: "campaign_not_found" };
  if (String(row.updated_at) !== input.expectedUpdatedAt) {
    return { ok: false, error: "stale_updated_at" };
  }

  const { data: inv, error: invErr } = await sb
    .from("delivery_ad_inventories")
    .select("id, key")
    .eq("key", input.inventoryKey)
    .eq("is_active", true)
    .maybeSingle();
  if (invErr || !inv) return { ok: false, error: "invalid_inventory" };

  const junction =
    input.productKind === "banner"
      ? "delivery_banner_campaign_inventories"
      : "delivery_store_sponsored_campaign_inventories";

  await sb.from(junction).delete().eq("campaign_id", input.campaignId);
  const { error: jErr } = await sb.from(junction).insert({
    campaign_id: input.campaignId,
    inventory_id: inv.id,
    priority: 0,
  });
  if (jErr) return { ok: false, error: "db_error", detail: jErr.message };

  if (input.productKind === "banner") {
    const surface =
      INVENTORY_KEY_TO_BANNER_DB_SURFACE[input.inventoryKey] ?? BANNER_AD_DB_SURFACE;
    await sb
      .from(table)
      .update({
        surface,
        updated_by_user_id: input.adminUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.campaignId);
  } else {
    const placement =
      input.inventoryKey === "STORES_HOME_FEED" ? "stores_home" : "stores_browse";
    await sb
      .from(table)
      .update({
        placement,
        updated_by_user_id: input.adminUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.campaignId);
  }

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: input.productKind,
    campaign_id: input.campaignId,
    actor_type: "admin",
    actor_user_id: input.adminUserId,
    action: "inventory_changed",
    reason: input.reason?.trim() || null,
    before_json: null,
    after_json: { inventory_key: input.inventoryKey },
  });

  return { ok: true };
}

/** Admin Banner creative replace — new version row + supersedes (no overwrite). */
export async function adminReplaceBannerCreative(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    campaignId: string;
    expectedUpdatedAt: string;
    assetPath: string;
    sourceWidth: number;
    sourceHeight: number;
    headline?: string | null;
    subcopy?: string | null;
    reason?: string | null;
  }
): Promise<
  | { ok: true; creativeId: string; version: number }
  | { ok: false; error: AdminDeliveryAdWriterError; detail?: string }
> {
  const assetPath = String(input.assetPath ?? "").trim();
  if (!assetPath) return { ok: false, error: "db_error", detail: "empty_asset_path" };
  if (assetPath === OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET) {
    return { ok: false, error: "creative_not_ready", detail: "placeholder_forbidden" };
  }

  const { data: row, error: loadErr } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .select("id, store_id, owner_user_id, creative_id, updated_at, lifecycle_status, image_url")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: "db_error", detail: loadErr.message };
  if (!row) return { ok: false, error: "campaign_not_found" };
  if (String(row.updated_at) !== input.expectedUpdatedAt) {
    return { ok: false, error: "stale_updated_at" };
  }

  const inventoryKeys = await loadBannerInventoryKeys(sb, input.campaignId);
  const keysToValidate =
    inventoryKeys.length > 0 ? inventoryKeys : (["STORES_HOME_HERO"] as const);
  for (const key of keysToValidate) {
    const inv = validateOwnerBannerInventory(key);
    if (!inv.ok) {
      const mapped =
        inv.error === "future_inventory" ? "future_inventory" : "invalid_inventory";
      return { ok: false, error: mapped, detail: `${inv.error}:${key}` };
    }
    const ratio = validateOwnerBannerCreativeAspect({
      inventoryKey: inv.key,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
    });
    if (!ratio.ok) {
      return { ok: false, error: "invalid_inventory", detail: `${ratio.error}:${inv.key}` };
    }
  }

  let nextVersion = 1;
  const prevCreativeId = row.creative_id == null ? null : String(row.creative_id);
  if (prevCreativeId) {
    const { data: prev } = await sb
      .from("delivery_ad_creatives")
      .select("version")
      .eq("id", prevCreativeId)
      .maybeSingle();
    nextVersion = Number(prev?.version ?? 0) + 1;
  }

  const { data: created, error: cErr } = await sb
    .from("delivery_ad_creatives")
    .insert({
      product_kind: "banner",
      owner_id: row.owner_user_id,
      store_id: row.store_id,
      asset_path: assetPath,
      source_width: input.sourceWidth,
      source_height: input.sourceHeight,
      source_aspect_ratio: simplifyAspectRatio(input.sourceWidth, input.sourceHeight),
      headline: input.headline ?? null,
      subcopy: input.subcopy ?? null,
      review_status: "APPROVED",
      version: nextVersion,
      supersedes_creative_id: prevCreativeId,
      created_by: input.adminUserId,
    })
    .select("id, version")
    .single();
  if (cErr || !created) return { ok: false, error: "db_error", detail: cErr?.message };

  const { error: uErr } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .update({
      creative_id: created.id,
      image_url: assetPath,
      updated_by_user_id: input.adminUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.campaignId)
    .eq("updated_at", input.expectedUpdatedAt);
  if (uErr) {
    // Failed campaign attach — keep prior creative pointer; new row is orphan supersede only.
    return { ok: false, error: "db_error", detail: uErr.message };
  }

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: "banner",
    campaign_id: input.campaignId,
    actor_type: "admin",
    actor_user_id: input.adminUserId,
    action: "creative_replaced",
    reason: input.reason?.trim() || null,
    before_json: {
      creative_id: prevCreativeId,
      image_url: row.image_url == null ? null : String(row.image_url),
    },
    after_json: {
      creative_id: created.id,
      version: created.version,
      image_url: assetPath,
    },
  });

  return { ok: true, creativeId: String(created.id), version: Number(created.version) };
}

/** Admin final destination — single cta_href field (Owner request → Admin final). */
export async function adminUpdateBannerDestination(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    campaignId: string;
    expectedUpdatedAt: string;
    ctaType?: unknown;
    ctaHref?: string | null;
    reason?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: AdminDeliveryAdWriterError; detail?: string }> {
  const { data: row, error: loadErr } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .select("id, store_id, creative_id, cta_href, updated_at")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: "db_error", detail: loadErr.message };
  if (!row) return { ok: false, error: "campaign_not_found" };
  if (String(row.updated_at) !== input.expectedUpdatedAt) {
    return { ok: false, error: "stale_updated_at" };
  }

  const storeId = row.store_id == null ? null : String(row.store_id);
  let nextHref = String(input.ctaHref ?? "").trim();
  let resolvedCtaType: string | null = null;

  if (input.ctaType != null && String(input.ctaType).trim()) {
    if (!storeId) return { ok: false, error: "destination_not_ready", detail: "store_required" };
    const cta = validateOwnerBannerCta({
      ctaType: input.ctaType,
      ctaTargetId: storeId,
    });
    if (!cta.ok) {
      return { ok: false, error: "destination_not_ready", detail: cta.error };
    }
    const { data: store } = await sb
      .from("stores")
      .select("slug")
      .eq("id", storeId)
      .maybeSingle();
    const slug = String((store as { slug?: string } | null)?.slug ?? "").trim();
    if (!slug) return { ok: false, error: "destination_not_ready", detail: "store_slug_missing" };
    nextHref = resolveOwnerBannerCtaHref({ ctaType: cta.ctaType, storeSlug: slug });
    resolvedCtaType = cta.ctaType;
  }

  if (!isDeliveryBannerDestinationReady(nextHref)) {
    return { ok: false, error: "destination_not_ready", detail: "invalid_cta_href" };
  }

  const beforeHref = row.cta_href == null ? null : String(row.cta_href);
  const { error: uErr } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .update({
      cta_href: nextHref,
      updated_by_user_id: input.adminUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.campaignId)
    .eq("updated_at", input.expectedUpdatedAt);
  if (uErr) return { ok: false, error: "db_error", detail: uErr.message };

  if (row.creative_id && resolvedCtaType) {
    await sb
      .from("delivery_ad_creatives")
      .update({
        cta_type: resolvedCtaType,
        cta_target_id: storeId,
        cta_label: OWNER_BANNER_CTA_TARGET_TO_LABEL_KEY[
          resolvedCtaType as keyof typeof OWNER_BANNER_CTA_TARGET_TO_LABEL_KEY
        ],
      })
      .eq("id", String(row.creative_id));
  }

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: "banner",
    campaign_id: input.campaignId,
    actor_type: "admin",
    actor_user_id: input.adminUserId,
    action: "destination_changed",
    reason: input.reason?.trim() || null,
    before_json: { cta_href: beforeHref },
    after_json: { cta_href: nextHref, cta_type: resolvedCtaType },
  });

  return { ok: true };
}

/** Remove final creative → pending placeholder (NOT READY / non-deliverable). */
export async function adminRemoveBannerCreative(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    campaignId: string;
    expectedUpdatedAt: string;
    reason?: string | null;
  }
): Promise<
  | { ok: true; creativeId: string; version: number }
  | { ok: false; error: AdminDeliveryAdWriterError; detail?: string }
> {
  const { data: row, error: loadErr } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .select("id, store_id, owner_user_id, creative_id, updated_at, image_url")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: "db_error", detail: loadErr.message };
  if (!row) return { ok: false, error: "campaign_not_found" };
  if (String(row.updated_at) !== input.expectedUpdatedAt) {
    return { ok: false, error: "stale_updated_at" };
  }

  const {
    OWNER_BANNER_PENDING_SOURCE_WIDTH,
    OWNER_BANNER_PENDING_SOURCE_HEIGHT,
  } = await import("@/lib/stores/advertising/owner-delivery-ad-commercial-bind");

  let nextVersion = 1;
  const prevCreativeId = row.creative_id == null ? null : String(row.creative_id);
  if (prevCreativeId) {
    const { data: prev } = await sb
      .from("delivery_ad_creatives")
      .select("version")
      .eq("id", prevCreativeId)
      .maybeSingle();
    nextVersion = Number(prev?.version ?? 0) + 1;
  }

  const pendingAsset = OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET;
  const { data: created, error: cErr } = await sb
    .from("delivery_ad_creatives")
    .insert({
      product_kind: "banner",
      owner_id: row.owner_user_id,
      store_id: row.store_id,
      asset_path: pendingAsset,
      source_width: OWNER_BANNER_PENDING_SOURCE_WIDTH,
      source_height: OWNER_BANNER_PENDING_SOURCE_HEIGHT,
      source_aspect_ratio: simplifyAspectRatio(
        OWNER_BANNER_PENDING_SOURCE_WIDTH,
        OWNER_BANNER_PENDING_SOURCE_HEIGHT
      ),
      review_status: "PENDING",
      version: nextVersion,
      supersedes_creative_id: prevCreativeId,
      created_by: input.adminUserId,
    })
    .select("id, version")
    .single();
  if (cErr || !created) return { ok: false, error: "db_error", detail: cErr?.message };

  const { error: uErr } = await sb
    .from(BANNER_AD_CAMPAIGN_TABLE)
    .update({
      creative_id: created.id,
      image_url: pendingAsset,
      updated_by_user_id: input.adminUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.campaignId)
    .eq("updated_at", input.expectedUpdatedAt);
  if (uErr) return { ok: false, error: "db_error", detail: uErr.message };

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: "banner",
    campaign_id: input.campaignId,
    actor_type: "admin",
    actor_user_id: input.adminUserId,
    action: "creative_removed",
    reason: input.reason?.trim() || null,
    before_json: {
      creative_id: prevCreativeId,
      image_url: row.image_url == null ? null : String(row.image_url),
    },
    after_json: {
      creative_id: created.id,
      version: created.version,
      image_url: pendingAsset,
    },
  });

  return { ok: true, creativeId: String(created.id), version: Number(created.version) };
}

/** Exported for tests — approve go-live resolution. */
export function adminApproveGoLiveForTests(startAtIso: string, nowMs?: number) {
  return resolveApprovedGoLiveStatus(startAtIso, nowMs);
}

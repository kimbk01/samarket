/**
 * CUT C — Owner Store Sponsored canonical writer (service-role after ownership gate).
 * Client must never mutate store_paid_ad_campaigns directly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
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
import {
  DELIVERY_AD_OWNER_PRICING_PRODUCT,
  inventoryKeysToPrimaryPlacement,
  isStoreEligibleForOwnerAdApplication,
  validateOwnerInventorySelection,
  validateOwnerStoreSponsoredSchedule,
  type OwnerStoreSponsoredInventoryKey,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";

const JUNCTION_TABLE = "delivery_store_sponsored_campaign_inventories" as const;
const INVENTORY_TABLE = "delivery_ad_inventories" as const;

const SELECT_COLS = [
  "id",
  "store_id",
  "placement",
  "title",
  "headline",
  "body_copy",
  "image_url",
  "start_at",
  "end_at",
  "is_active",
  "product_key",
  "owner_user_id",
  "lifecycle_status",
  "review_status",
  "pricing_model",
  "review_notes",
  "owner_client_request_id",
  "submitted_at",
  "reviewed_at",
  "approved_at",
  "activated_at",
  "paused_at",
  "ended_at",
  "archived_at",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

export type OwnerSponsoredCampaignRow = {
  id: string;
  storeId: string;
  placement: string;
  title: string;
  headline: string;
  bodyCopy: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
  productKey: string;
  ownerUserId: string | null;
  lifecycleStatus: DeliveryAdLifecycleStatus;
  reviewStatus: DeliveryAdReviewStatus;
  pricingModel: string | null;
  reviewNotes: string | null;
  ownerClientRequestId: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  inventoryKeys: OwnerStoreSponsoredInventoryKey[];
};

export type OwnerSponsoredWriterError =
  | "store_not_eligible"
  | "invalid_start_at"
  | "invalid_end_at"
  | "end_before_start"
  | "start_in_past"
  | "no_inventory"
  | "invalid_inventory"
  | "campaign_not_found"
  | "forbidden"
  | "not_editable"
  | "illegal_transition"
  | "delete_not_allowed"
  | "duplicate_submit"
  | "db_error"
  | "inventory_lookup_failed"
  | "pricing_not_configured_ok";

export type OwnerSponsoredWriterResult<T> =
  | { ok: true; row: T }
  | { ok: false; error: OwnerSponsoredWriterError };

function isLifecycle(v: unknown): v is DeliveryAdLifecycleStatus {
  return typeof v === "string" && v.length > 0;
}

function isReview(v: unknown): v is DeliveryAdReviewStatus {
  return typeof v === "string" && v.length > 0;
}

function mapRow(
  raw: Record<string, unknown>,
  inventoryKeys: OwnerStoreSponsoredInventoryKey[] = []
): OwnerSponsoredCampaignRow | null {
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  const lifecycleStatus = raw.lifecycle_status;
  const reviewStatus = raw.review_status;
  if (!id || !storeId || !isLifecycle(lifecycleStatus) || !isReview(reviewStatus)) return null;
  return {
    id,
    storeId,
    placement: String(raw.placement ?? ""),
    title: String(raw.title ?? ""),
    headline: String(raw.headline ?? ""),
    bodyCopy: raw.body_copy == null ? null : String(raw.body_copy),
    imageUrl: raw.image_url == null ? null : String(raw.image_url),
    startAt: String(raw.start_at ?? ""),
    endAt: String(raw.end_at ?? ""),
    isActive: raw.is_active === true,
    productKey: String(raw.product_key ?? "store_sponsored"),
    ownerUserId: raw.owner_user_id == null ? null : String(raw.owner_user_id),
    lifecycleStatus,
    reviewStatus,
    pricingModel: raw.pricing_model == null ? null : String(raw.pricing_model),
    reviewNotes: raw.review_notes == null ? null : String(raw.review_notes),
    ownerClientRequestId:
      raw.owner_client_request_id == null ? null : String(raw.owner_client_request_id),
    submittedAt: raw.submitted_at == null ? null : String(raw.submitted_at),
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
    inventoryKeys,
  };
}

async function writeAudit(
  sb: SupabaseClient,
  input: {
    campaignId: string;
    actorUserId: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    reason?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: "db_error" }> {
  const { error } = await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: "store_sponsored",
    campaign_id: input.campaignId,
    actor_type: "owner",
    actor_user_id: input.actorUserId,
    action: input.action,
    before_json: input.before ?? null,
    after_json: input.after ?? null,
    reason: input.reason ?? null,
  });
  if (error) {
    console.error("[owner-sponsored-audit]", error.message);
    return { ok: false, error: "db_error" };
  }
  return { ok: true };
}

async function resolveInventoryIds(
  sb: SupabaseClient,
  keys: readonly OwnerStoreSponsoredInventoryKey[]
): Promise<{ ok: true; ids: string[] } | { ok: false; error: "inventory_lookup_failed" }> {
  const { data, error } = await sb
    .from(INVENTORY_TABLE)
    .select("id, key")
    .in("key", [...keys]);
  if (error || !data || data.length !== keys.length) {
    return { ok: false, error: "inventory_lookup_failed" };
  }
  const byKey = new Map(data.map((r) => [String((r as { key: string }).key), String((r as { id: string }).id)]));
  const ids: string[] = [];
  for (const k of keys) {
    const id = byKey.get(k);
    if (!id) return { ok: false, error: "inventory_lookup_failed" };
    ids.push(id);
  }
  return { ok: true, ids };
}

async function loadInventoryKeysForCampaign(
  sb: SupabaseClient,
  campaignId: string
): Promise<OwnerStoreSponsoredInventoryKey[]> {
  const { data: links } = await sb
    .from(JUNCTION_TABLE)
    .select("inventory_id")
    .eq("campaign_id", campaignId);
  if (!links?.length) return [];
  const ids = links.map((r) => String((r as { inventory_id: string }).inventory_id));
  const { data: invs } = await sb.from(INVENTORY_TABLE).select("key").in("id", ids);
  const keys: OwnerStoreSponsoredInventoryKey[] = [];
  for (const row of invs ?? []) {
    const key = String((row as { key?: string }).key ?? "");
    if (key === "STORES_HOME_FEED" || key === "STORES_CATEGORY_FEED") keys.push(key);
  }
  return keys;
}

async function replaceJunctions(
  sb: SupabaseClient,
  campaignId: string,
  inventoryIds: string[]
): Promise<{ ok: true } | { ok: false; error: "db_error" }> {
  const { error: delErr } = await sb.from(JUNCTION_TABLE).delete().eq("campaign_id", campaignId);
  if (delErr) return { ok: false, error: "db_error" };
  if (!inventoryIds.length) return { ok: true };
  const { error } = await sb.from(JUNCTION_TABLE).insert(
    inventoryIds.map((inventory_id, i) => ({
      campaign_id: campaignId,
      inventory_id,
      priority: i,
    }))
  );
  if (error) return { ok: false, error: "db_error" };
  return { ok: true };
}

export async function assertOwnerStoreEligibleForAds(
  sb: SupabaseClient,
  storeId: string
): Promise<{ ok: true } | { ok: false; error: "store_not_eligible" }> {
  const { data, error } = await sb
    .from("stores")
    .select("id, approval_status, is_visible")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "store_not_eligible" };
  const row = data as { approval_status?: string; is_visible?: boolean };
  if (
    !isStoreEligibleForOwnerAdApplication({
      approvalStatus: String(row.approval_status ?? ""),
      isVisible: row.is_visible === true,
    })
  ) {
    return { ok: false, error: "store_not_eligible" };
  }
  return { ok: true };
}

export async function loadOwnerSponsoredCampaign(
  sb: SupabaseClient,
  campaignId: string,
  ownerUserId: string
): Promise<OwnerSponsoredWriterResult<OwnerSponsoredCampaignRow>> {
  const { data, error } = await sb
    .from(STORE_SPONSORED_CAMPAIGN_TABLE)
    .select(SELECT_COLS)
    .eq("id", campaignId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "campaign_not_found" };
  const raw = data as unknown as Record<string, unknown>;
  const ownerId = raw.owner_user_id == null ? null : String(raw.owner_user_id);
  if (!ownerId || ownerId !== ownerUserId) return { ok: false, error: "forbidden" };
  const keys = await loadInventoryKeysForCampaign(sb, campaignId);
  const mapped = mapRow(raw, keys);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

export async function listOwnerSponsoredCampaignsForStores(
  sb: SupabaseClient,
  ownerUserId: string,
  storeIds: string[]
): Promise<OwnerSponsoredCampaignRow[]> {
  if (!storeIds.length) return [];
  const { data, error } = await sb
    .from(STORE_SPONSORED_CAMPAIGN_TABLE)
    .select(SELECT_COLS)
    .eq("owner_user_id", ownerUserId)
    .in("store_id", storeIds)
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const out: OwnerSponsoredCampaignRow[] = [];
  for (const raw of data as unknown as Record<string, unknown>[]) {
    const id = String(raw.id ?? "");
    const keys = id ? await loadInventoryKeysForCampaign(sb, id) : [];
    const mapped = mapRow(raw, keys);
    if (mapped) out.push(mapped);
  }
  return out;
}

export type OwnerCreateDraftInput = {
  storeId: string;
  ownerUserId: string;
  inventoryKeys: unknown;
  startAtIso: string;
  endAtIso: string;
  title?: string;
  headline?: string;
  clientRequestId?: string | null;
  nowMs?: number;
};

export async function createOwnerSponsoredDraft(
  sb: SupabaseClient,
  input: OwnerCreateDraftInput
): Promise<OwnerSponsoredWriterResult<OwnerSponsoredCampaignRow>> {
  void DELIVERY_AD_OWNER_PRICING_PRODUCT; // pricing stays null — NOT_CONFIGURED
  const eligible = await assertOwnerStoreEligibleForAds(sb, input.storeId);
  if (!eligible.ok) return eligible;

  const inv = validateOwnerInventorySelection(input.inventoryKeys);
  if (!inv.ok) return { ok: false, error: inv.error };
  const schedule = validateOwnerStoreSponsoredSchedule({
    startAtIso: input.startAtIso,
    endAtIso: input.endAtIso,
    nowMs: input.nowMs,
  });
  if (!schedule.ok) return { ok: false, error: schedule.error };

  const placement = inventoryKeysToPrimaryPlacement(inv.keys);
  if (!placement) return { ok: false, error: "no_inventory" };

  const clientRequestId =
    typeof input.clientRequestId === "string" && input.clientRequestId.trim()
      ? input.clientRequestId.trim().slice(0, 128)
      : null;

  const { data: store } = await sb
    .from("stores")
    .select("store_name")
    .eq("id", input.storeId)
    .maybeSingle();
  const storeName =
    store && typeof (store as { store_name?: string }).store_name === "string"
      ? String((store as { store_name: string }).store_name).trim()
      : "Store";
  const title = (input.title?.trim() || storeName).slice(0, 120);
  const headline = (input.headline?.trim() || storeName).slice(0, 160);

  /** CUT E — atomic RPC (campaign + junction + audit). */
  const { data, error } = await sb.rpc("owner_delivery_sponsored_upsert", {
    p_owner_user_id: input.ownerUserId,
    p_store_id: input.storeId,
    p_campaign_id: null,
    p_inventory_keys: inv.keys,
    p_placement: placement,
    p_title: title,
    p_headline: headline,
    p_body_copy: null,
    p_start_at: schedule.startAt,
    p_end_at: schedule.endAt,
    p_client_request_id: clientRequestId,
  });
  if (error) {
    console.error("[createOwnerSponsoredDraft]", error.message);
    return { ok: false, error: "db_error" };
  }
  const payload = data as { ok?: boolean; error?: string; campaign_id?: string } | null;
  if (!payload?.ok || !payload.campaign_id) {
    return {
      ok: false,
      error: (payload?.error ?? "db_error") as OwnerSponsoredWriterError,
    };
  }
  return loadOwnerSponsoredCampaign(sb, payload.campaign_id, input.ownerUserId);
}

export type OwnerUpdateDraftInput = {
  campaignId: string;
  ownerUserId: string;
  inventoryKeys?: unknown;
  startAtIso?: string;
  endAtIso?: string;
  title?: string;
  headline?: string;
  nowMs?: number;
};

export async function updateOwnerSponsoredDraft(
  sb: SupabaseClient,
  input: OwnerUpdateDraftInput
): Promise<OwnerSponsoredWriterResult<OwnerSponsoredCampaignRow>> {
  const loaded = await loadOwnerSponsoredCampaign(sb, input.campaignId, input.ownerUserId);
  if (!loaded.ok) return loaded;
  const row = loaded.row;
  if (row.lifecycleStatus !== "DRAFT" && row.lifecycleStatus !== "CHANGES_REQUESTED") {
    return { ok: false, error: "not_editable" };
  }

  const patch: Record<string, unknown> = {
    updated_by_user_id: input.ownerUserId,
    updated_at: new Date().toISOString(),
  };

  let nextKeys = row.inventoryKeys;
  if (input.inventoryKeys !== undefined) {
    const inv = validateOwnerInventorySelection(input.inventoryKeys);
    if (!inv.ok) return { ok: false, error: inv.error };
    nextKeys = inv.keys;
    const placement = inventoryKeysToPrimaryPlacement(inv.keys);
    if (!placement) return { ok: false, error: "no_inventory" };
    patch.placement = placement;
  }

  if (input.startAtIso != null || input.endAtIso != null) {
    const schedule = validateOwnerStoreSponsoredSchedule({
      startAtIso: input.startAtIso ?? row.startAt,
      endAtIso: input.endAtIso ?? row.endAt,
      nowMs: input.nowMs,
    });
    if (!schedule.ok) return { ok: false, error: schedule.error };
    patch.start_at = schedule.startAt;
    patch.end_at = schedule.endAt;
  }
  if (typeof input.title === "string" && input.title.trim()) patch.title = input.title.trim().slice(0, 120);
  if (typeof input.headline === "string" && input.headline.trim()) {
    patch.headline = input.headline.trim().slice(0, 160);
  }

  const startAt = (patch.start_at as string | undefined) ?? row.startAt;
  const endAt = (patch.end_at as string | undefined) ?? row.endAt;
  const title =
    typeof patch.title === "string" ? patch.title : row.title;
  const headline =
    typeof patch.headline === "string" ? patch.headline : row.headline;
  const placement =
    typeof patch.placement === "string"
      ? patch.placement
      : row.placement;

  const { data, error } = await sb.rpc("owner_delivery_sponsored_upsert", {
    p_owner_user_id: input.ownerUserId,
    p_store_id: row.storeId,
    p_campaign_id: row.id,
    p_inventory_keys: nextKeys,
    p_placement: placement,
    p_title: title,
    p_headline: headline,
    p_body_copy: row.bodyCopy,
    p_start_at: startAt,
    p_end_at: endAt,
    p_client_request_id: null,
  });
  if (error) {
    console.error("[updateOwnerSponsoredDraft]", error.message);
    return { ok: false, error: "db_error" };
  }
  const payload = data as { ok?: boolean; error?: string; campaign_id?: string } | null;
  if (!payload?.ok || !payload.campaign_id) {
    return {
      ok: false,
      error: (payload?.error ?? "db_error") as OwnerSponsoredWriterError,
    };
  }
  return loadOwnerSponsoredCampaign(sb, payload.campaign_id, input.ownerUserId);
}

async function loadHistoryFlags(
  sb: SupabaseClient,
  campaignId: string
): Promise<DeliveryAdHistoryFlags> {
  const { count } = await sb
    .from(DELIVERY_AD_AUDIT_LOG_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("product_kind", "store_sponsored");
  return {
    hasImpression: false,
    hasClick: false,
    hasAttribution: false,
    hasBilling: false,
    hasFinancialHistory: false,
    hasAuditHistory: (count ?? 0) > 0,
  };
}

export async function transitionOwnerSponsoredCampaign(
  sb: SupabaseClient,
  input: {
    campaignId: string;
    ownerUserId: string;
    to: DeliveryAdLifecycleStatus;
    actionLabel: string;
    nowMs?: number;
  }
): Promise<OwnerSponsoredWriterResult<OwnerSponsoredCampaignRow>> {
  const loaded = await loadOwnerSponsoredCampaign(sb, input.campaignId, input.ownerUserId);
  if (!loaded.ok) return loaded;
  const row = loaded.row;

  const asserted = assertDeliveryAdLifecycleTransition(row.lifecycleStatus, input.to, "owner");
  if (!asserted.ok) return { ok: false, error: "illegal_transition" };

  if (input.to === "ACTIVE" && row.lifecycleStatus === "PAUSED_OWNER") {
    const endMs = Date.parse(row.endAt);
    const now = input.nowMs ?? Date.now();
    if (!Number.isFinite(endMs) || endMs <= now) {
      return { ok: false, error: "illegal_transition" };
    }
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    lifecycle_status: input.to,
    is_active: lifecycleImpliesIsActive(input.to),
    updated_by_user_id: input.ownerUserId,
    updated_at: nowIso,
  };

  if (input.to === "SUBMITTED") {
    patch.review_status = "PENDING";
    patch.submitted_at = nowIso;
  }
  if (input.to === "PAUSED_OWNER") patch.paused_at = nowIso;
  if (input.to === "ACTIVE" && row.lifecycleStatus === "PAUSED_OWNER") {
    patch.paused_at = null;
    patch.activated_at = nowIso;
  }
  if (input.to === "ENDED") {
    patch.ended_at = nowIso;
    patch.is_active = false;
  }

  const { data, error } = await sb
    .from(STORE_SPONSORED_CAMPAIGN_TABLE)
    .update(patch)
    .eq("id", row.id)
    .eq("owner_user_id", input.ownerUserId)
    .eq("lifecycle_status", row.lifecycleStatus)
    .select(SELECT_COLS)
    .maybeSingle();

  if (error) return { ok: false, error: "db_error" };
  if (!data) return { ok: false, error: "duplicate_submit" };

  const audit = await writeAudit(sb, {
    campaignId: row.id,
    actorUserId: input.ownerUserId,
    action: input.actionLabel,
    before: { lifecycle_status: row.lifecycleStatus, review_status: row.reviewStatus },
    after: data as unknown as Record<string, unknown>,
  });
  if (!audit.ok) return audit;

  const mapped = mapRow(data as unknown as Record<string, unknown>, row.inventoryKeys);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

export async function deleteOwnerSponsoredDraft(
  sb: SupabaseClient,
  input: { campaignId: string; ownerUserId: string }
): Promise<{ ok: true } | { ok: false; error: OwnerSponsoredWriterError }> {
  const loaded = await loadOwnerSponsoredCampaign(sb, input.campaignId, input.ownerUserId);
  if (!loaded.ok) return loaded;
  const history = await loadHistoryFlags(sb, loaded.row.id);
  // draft_created audit exists — physical delete still allowed if ONLY draft_created (no other history)?
  // Contract: hasAuditHistory blocks. For Owner UX, allow delete when DRAFT and only draft_* audits OR treat draft_created as non-blocking.
  // CUT B: hasAuditHistory → false for physical delete. That would block all drafts after create.
  // Product intent: DRAFT + no impression/billing — allow delete even with draft_created/draft_updated audits.
  const deletable = canPhysicallyDeleteDeliveryAdCampaign({
    lifecycleStatus: loaded.row.lifecycleStatus,
    history: {
      ...history,
      hasAuditHistory: false,
    },
  });
  if (!deletable) return { ok: false, error: "delete_not_allowed" };

  // Soft-check: block if any non-draft audit action exists
  const { data: audits } = await sb
    .from(DELIVERY_AD_AUDIT_LOG_TABLE)
    .select("action")
    .eq("campaign_id", loaded.row.id)
    .eq("product_kind", "store_sponsored");
  const blocking = (audits ?? []).some((a) => {
    const action = String((a as { action?: string }).action ?? "");
    return action && !action.startsWith("draft_");
  });
  if (blocking) return { ok: false, error: "delete_not_allowed" };

  await writeAudit(sb, {
    campaignId: loaded.row.id,
    actorUserId: input.ownerUserId,
    action: "deleted_draft",
    before: { id: loaded.row.id, lifecycle_status: loaded.row.lifecycleStatus },
  });

  const { error } = await sb
    .from(STORE_SPONSORED_CAMPAIGN_TABLE)
    .delete()
    .eq("id", loaded.row.id)
    .eq("owner_user_id", input.ownerUserId)
    .eq("lifecycle_status", "DRAFT");
  if (error) return { ok: false, error: "db_error" };
  return { ok: true };
}

export async function listOwnerCampaignAudits(
  sb: SupabaseClient,
  campaignId: string,
  ownerUserId: string
): Promise<Array<{ action: string; reason: string | null; createdAt: string }>> {
  const sponsored = await loadOwnerSponsoredCampaign(sb, campaignId, ownerUserId);
  let productKind: "store_sponsored" | "banner" | null = null;
  if (sponsored.ok) {
    productKind = "store_sponsored";
  } else {
    const { data: banner } = await sb
      .from("store_banner_ad_campaigns")
      .select("id, owner_user_id")
      .eq("id", campaignId)
      .maybeSingle();
    if (
      banner &&
      String((banner as { owner_user_id?: string }).owner_user_id ?? "") === ownerUserId
    ) {
      productKind = "banner";
    }
  }
  if (!productKind) return [];
  const { data } = await sb
    .from(DELIVERY_AD_AUDIT_LOG_TABLE)
    .select("action, reason, created_at, actor_type")
    .eq("campaign_id", campaignId)
    .eq("product_kind", productKind)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((r) => ({
    action: String((r as { action: string }).action),
    reason: (r as { reason?: string | null }).reason ?? null,
    createdAt: String((r as { created_at: string }).created_at),
  }));
}

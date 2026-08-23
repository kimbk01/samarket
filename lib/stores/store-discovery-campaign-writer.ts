/**
 * W — Admin Campaign HTTP Writer (server-only DB writes).
 * Canonical write path: Admin API route → this module → store_discovery_campaigns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORE_DISCOVERY_CAMPAIGN_TABLE,
  type StoreDiscoveryCampaignType,
} from "@/lib/stores/store-discovery-campaign-authority";
import {
  parseStoreDiscoveryCampaignCreateBody,
  parseStoreDiscoveryCampaignUpdateBody,
  resolveStoreDiscoveryCampaignUpdateWindow,
  type StoreDiscoveryCampaignCreateInput,
  type StoreDiscoveryCampaignUpdateInput,
} from "@/lib/stores/store-discovery-campaign-validation";

export type StoreDiscoveryCampaignWriterRow = {
  id: string;
  store_id: string;
  campaign_type: StoreDiscoveryCampaignType;
  title: string;
  body_copy: string | null;
  start_at: string;
  end_at: string;
  is_active: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreDiscoveryCampaignWriterError =
  | "forbidden_fields"
  | "missing_store_id"
  | "missing_id"
  | "invalid_campaign_type"
  | "empty_title"
  | "invalid_start_at"
  | "invalid_end_at"
  | "invalid_window"
  | "store_id_not_allowed_on_update"
  | "store_not_found"
  | "store_not_eligible"
  | "campaign_not_found"
  | "db_error";

export type StoreDiscoveryCampaignWriterResult<T> =
  | { ok: true; row: T }
  | { ok: false; error: StoreDiscoveryCampaignWriterError; forbidden?: string[] };

function mapDbRow(raw: Record<string, unknown>): StoreDiscoveryCampaignWriterRow | null {
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  const campaignType = raw.campaign_type;
  const title = String(raw.title ?? "").trim();
  const startAt = String(raw.start_at ?? "").trim();
  const endAt = String(raw.end_at ?? "").trim();
  if (!id || !storeId || !title || !startAt || !endAt) return null;
  if (campaignType !== "event" && campaignType !== "promo") return null;
  const bodyRaw = raw.body_copy;
  const bodyCopy =
    bodyRaw == null ? null : String(bodyRaw).trim() ? String(bodyRaw).trim() : null;
  return {
    id,
    store_id: storeId,
    campaign_type: campaignType,
    title,
    body_copy: bodyCopy,
    start_at: startAt,
    end_at: endAt,
    is_active: raw.is_active === true,
    created_by_user_id:
      raw.created_by_user_id == null ? null : String(raw.created_by_user_id).trim() || null,
    updated_by_user_id:
      raw.updated_by_user_id == null ? null : String(raw.updated_by_user_id).trim() || null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

/** Store must exist and be approved — does not replicate Discovery candidate ranking. */
export async function assertStoreEligibleForDiscoveryCampaignWrite(
  sb: SupabaseClient,
  storeId: string
): Promise<{ ok: true } | { ok: false; error: "store_not_found" | "store_not_eligible" }> {
  const id = String(storeId ?? "").trim();
  if (!id) return { ok: false, error: "store_not_found" };

  const { data, error } = await sb
    .from("stores")
    .select("id, approval_status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "store_not_found" };
  if (String((data as { approval_status?: unknown }).approval_status ?? "") !== "approved") {
    return { ok: false, error: "store_not_eligible" };
  }
  return { ok: true };
}

export async function createStoreDiscoveryCampaignAdmin(
  sb: SupabaseClient,
  rawBody: unknown,
  adminUserId: string
): Promise<StoreDiscoveryCampaignWriterResult<StoreDiscoveryCampaignWriterRow>> {
  const parsed = parseStoreDiscoveryCampaignCreateBody(rawBody);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, forbidden: parsed.forbidden };
  }

  const storeCheck = await assertStoreEligibleForDiscoveryCampaignWrite(sb, parsed.value.storeId);
  if (!storeCheck.ok) return { ok: false, error: storeCheck.error };

  const row = buildInsertRow(parsed.value, adminUserId);
  const { data, error } = await sb
    .from(STORE_DISCOVERY_CAMPAIGN_TABLE)
    .insert(row)
    .select(
      "id, store_id, campaign_type, title, body_copy, start_at, end_at, is_active, created_by_user_id, updated_by_user_id, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    console.error("[createStoreDiscoveryCampaignAdmin]", error?.message);
    return { ok: false, error: "db_error" };
  }

  const mapped = mapDbRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

function buildInsertRow(input: StoreDiscoveryCampaignCreateInput, adminUserId: string) {
  const now = new Date().toISOString();
  return {
    store_id: input.storeId,
    campaign_type: input.campaignType,
    title: input.title,
    body_copy: input.bodyCopy,
    start_at: input.startAt,
    end_at: input.endAt,
    is_active: input.isActive,
    created_by_user_id: adminUserId,
    updated_by_user_id: adminUserId,
    created_at: now,
    updated_at: now,
  };
}

export async function updateStoreDiscoveryCampaignAdmin(
  sb: SupabaseClient,
  rawBody: unknown,
  adminUserId: string
): Promise<StoreDiscoveryCampaignWriterResult<StoreDiscoveryCampaignWriterRow>> {
  const parsed = parseStoreDiscoveryCampaignUpdateBody(rawBody);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, forbidden: parsed.forbidden };
  }

  const existing = await loadCampaignRowForUpdate(sb, parsed.value.id);
  if (!existing.ok) return existing;

  const window = resolveStoreDiscoveryCampaignUpdateWindow(
    { startAt: existing.row.start_at, endAt: existing.row.end_at },
    parsed.value
  );
  if (!window) return { ok: false, error: "invalid_window" };

  const patch = buildUpdatePatch(parsed.value, window, adminUserId);
  const { data, error } = await sb
    .from(STORE_DISCOVERY_CAMPAIGN_TABLE)
    .update(patch)
    .eq("id", parsed.value.id)
    .select(
      "id, store_id, campaign_type, title, body_copy, start_at, end_at, is_active, created_by_user_id, updated_by_user_id, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    console.error("[updateStoreDiscoveryCampaignAdmin]", error?.message);
    return { ok: false, error: "db_error" };
  }

  const mapped = mapDbRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

async function loadCampaignRowForUpdate(
  sb: SupabaseClient,
  campaignId: string
): Promise<
  | { ok: true; row: StoreDiscoveryCampaignWriterRow }
  | { ok: false; error: StoreDiscoveryCampaignWriterError }
> {
  const id = String(campaignId ?? "").trim();
  if (!id) return { ok: false, error: "missing_id" };

  const { data, error } = await sb
    .from(STORE_DISCOVERY_CAMPAIGN_TABLE)
    .select(
      "id, store_id, campaign_type, title, body_copy, start_at, end_at, is_active, created_by_user_id, updated_by_user_id, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[loadCampaignRowForUpdate]", error.message);
    return { ok: false, error: "db_error" };
  }
  if (!data) return { ok: false, error: "campaign_not_found" };

  const mapped = mapDbRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

function buildUpdatePatch(
  input: StoreDiscoveryCampaignUpdateInput,
  window: { startAt: string; endAt: string },
  adminUserId: string
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    start_at: window.startAt,
    end_at: window.endAt,
    updated_by_user_id: adminUserId,
    updated_at: new Date().toISOString(),
  };
  if (input.campaignType !== undefined) patch.campaign_type = input.campaignType;
  if (input.title !== undefined) patch.title = input.title;
  if (input.bodyCopy !== undefined) patch.body_copy = input.bodyCopy;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  return patch;
}

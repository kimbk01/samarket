import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { assertStoreEligibleForDiscoveryCampaignWrite } from "@/lib/stores/store-discovery-campaign-writer";
import {
  parseStorePaidAdCampaignCreateBody,
  parseStorePaidAdCampaignUpdateBody,
  resolveStorePaidAdCampaignUpdateWindow,
  type StorePaidAdCampaignCreateInput,
  type StorePaidAdCampaignUpdateInput,
} from "@/lib/stores/store-paid-ad-campaign-validation";

export type StorePaidAdCampaignDbRow = {
  id: string;
  store_id: string;
  placement: string;
  title: string;
  headline: string;
  body_copy: string | null;
  image_url: string | null;
  start_at: string;
  end_at: string;
  is_active: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StorePaidAdWriterError =
  | "forbidden_fields"
  | "missing_store_id"
  | "missing_id"
  | "invalid_placement"
  | "empty_title"
  | "empty_headline"
  | "invalid_start_at"
  | "invalid_end_at"
  | "invalid_window"
  | "store_not_found"
  | "store_not_eligible"
  | "campaign_not_found"
  | "db_error";

export type StorePaidAdWriterResult<T> =
  | { ok: true; row: T }
  | { ok: false; error: StorePaidAdWriterError; forbidden?: string[] };

function mapRow(raw: Record<string, unknown>): StorePaidAdCampaignDbRow | null {
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  const placement = String(raw.placement ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const headline = String(raw.headline ?? "").trim();
  const startAt = String(raw.start_at ?? "").trim();
  const endAt = String(raw.end_at ?? "").trim();
  if (!id || !storeId || !placement || !title || !headline || !startAt || !endAt) return null;
  return {
    id,
    store_id: storeId,
    placement,
    title,
    headline,
    body_copy: raw.body_copy == null ? null : String(raw.body_copy),
    image_url: raw.image_url == null ? null : String(raw.image_url),
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

const SELECT_COLS =
  "id, store_id, placement, title, headline, body_copy, image_url, start_at, end_at, is_active, created_by_user_id, updated_by_user_id, created_at, updated_at";

export async function createStorePaidAdCampaignAdmin(
  sb: SupabaseClient,
  rawBody: unknown,
  adminUserId: string
): Promise<StorePaidAdWriterResult<StorePaidAdCampaignDbRow>> {
  const parsed = parseStorePaidAdCampaignCreateBody(rawBody);
  if (!parsed.ok) return { ok: false, error: parsed.error as StorePaidAdWriterError, forbidden: parsed.forbidden };

  const storeCheck = await assertStoreEligibleForDiscoveryCampaignWrite(sb, parsed.value.storeId);
  if (!storeCheck.ok) return { ok: false, error: storeCheck.error };

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(STORE_PAID_AD_CAMPAIGN_TABLE)
    .insert(buildInsert(parsed.value, adminUserId, now))
    .select(SELECT_COLS)
    .single();

  if (error || !data) {
    console.error("[createStorePaidAdCampaignAdmin]", error?.message);
    return { ok: false, error: "db_error" };
  }
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

export async function updateStorePaidAdCampaignAdmin(
  sb: SupabaseClient,
  rawBody: unknown,
  adminUserId: string
): Promise<StorePaidAdWriterResult<StorePaidAdCampaignDbRow>> {
  const parsed = parseStorePaidAdCampaignUpdateBody(rawBody);
  if (!parsed.ok) return { ok: false, error: parsed.error as StorePaidAdWriterError, forbidden: parsed.forbidden };

  const existing = await loadRow(sb, parsed.value.id);
  if (!existing.ok) return existing;

  const window = resolveStorePaidAdCampaignUpdateWindow(
    { startAt: existing.row.start_at, endAt: existing.row.end_at },
    parsed.value
  );
  if (!window) return { ok: false, error: "invalid_window" };

  const patch = buildUpdate(parsed.value, window, adminUserId);
  const { data, error } = await sb
    .from(STORE_PAID_AD_CAMPAIGN_TABLE)
    .update(patch)
    .eq("id", parsed.value.id)
    .select(SELECT_COLS)
    .single();

  if (error || !data) {
    console.error("[updateStorePaidAdCampaignAdmin]", error?.message);
    return { ok: false, error: "db_error" };
  }
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

async function loadRow(
  sb: SupabaseClient,
  id: string
): Promise<
  | { ok: true; row: StorePaidAdCampaignDbRow }
  | { ok: false; error: StorePaidAdWriterError }
> {
  const campaignId = String(id ?? "").trim();
  if (!campaignId) return { ok: false, error: "missing_id" };
  const { data, error } = await sb
    .from(STORE_PAID_AD_CAMPAIGN_TABLE)
    .select(SELECT_COLS)
    .eq("id", campaignId)
    .maybeSingle();
  if (error) {
    console.error("[loadStorePaidAdRow]", error.message);
    return { ok: false, error: "db_error" };
  }
  if (!data) return { ok: false, error: "campaign_not_found" };
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

function buildInsert(input: StorePaidAdCampaignCreateInput, adminUserId: string, now: string) {
  return {
    store_id: input.storeId,
    placement: input.placement,
    title: input.title,
    headline: input.headline,
    body_copy: input.bodyCopy,
    image_url: input.imageUrl,
    start_at: input.startAt,
    end_at: input.endAt,
    is_active: input.isActive,
    created_by_user_id: adminUserId,
    updated_by_user_id: adminUserId,
    created_at: now,
    updated_at: now,
  };
}

function buildUpdate(
  input: StorePaidAdCampaignUpdateInput,
  window: { startAt: string; endAt: string },
  adminUserId: string
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    start_at: window.startAt,
    end_at: window.endAt,
    updated_by_user_id: adminUserId,
    updated_at: new Date().toISOString(),
  };
  if (input.placement !== undefined) patch.placement = input.placement;
  if (input.title !== undefined) patch.title = input.title;
  if (input.headline !== undefined) patch.headline = input.headline;
  if (input.bodyCopy !== undefined) patch.body_copy = input.bodyCopy;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  return patch;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_COUPON_CAMPAIGN_TABLE } from "@/lib/stores/store-coupon-campaign-authority";
import { assertStoreEligibleForDiscoveryCampaignWrite } from "@/lib/stores/store-discovery-campaign-writer";
import {
  resolveAdminSupportedCreateFunding,
  type AdminSupportedFundingWrite,
} from "@/lib/stores/store-coupon-ssot";
import {
  parseStoreCouponCampaignCreateBody,
  parseStoreCouponCampaignUpdateBody,
  resolveStoreCouponCampaignUpdateWindow,
  type StoreCouponCampaignCreateInput,
  type StoreCouponCampaignUpdateInput,
} from "@/lib/stores/store-coupon-campaign-validation";

export type StoreCouponCampaignDbRow = {
  id: string;
  store_id: string;
  title: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  terms_copy: string | null;
  start_at: string;
  end_at: string;
  is_active: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreCouponWriterError =
  | "forbidden_fields"
  | "missing_store_id"
  | "missing_id"
  | "empty_title"
  | "invalid_discount_type"
  | "invalid_discount_value"
  | "invalid_start_at"
  | "invalid_end_at"
  | "invalid_window"
  | "store_not_found"
  | "store_not_eligible"
  | "campaign_not_found"
  | "db_error"
  | "admin_funding_forbidden"
  | "admin_shared_share_required";

export type StoreCouponWriterResult<T> =
  | { ok: true; row: T }
  | { ok: false; error: StoreCouponWriterError; forbidden?: string[] };

const SELECT_COLS =
  "id, store_id, title, discount_type, discount_value, min_order_amount, terms_copy, start_at, end_at, is_active, created_by_user_id, updated_by_user_id, created_at, updated_at";

function mapRow(raw: Record<string, unknown>): StoreCouponCampaignDbRow | null {
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const discountType = String(raw.discount_type ?? "").trim();
  const startAt = String(raw.start_at ?? "").trim();
  const endAt = String(raw.end_at ?? "").trim();
  const discountValue = Number(raw.discount_value);
  if (!id || !storeId || !title || !discountType || !startAt || !endAt) return null;
  if (!Number.isFinite(discountValue)) return null;
  return {
    id,
    store_id: storeId,
    title,
    discount_type: discountType,
    discount_value: discountValue,
    min_order_amount:
      raw.min_order_amount == null ? null : Number(raw.min_order_amount),
    terms_copy: raw.terms_copy == null ? null : String(raw.terms_copy),
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

export async function createStoreCouponCampaignAdmin(
  sb: SupabaseClient,
  rawBody: unknown,
  adminUserId: string
): Promise<StoreCouponWriterResult<StoreCouponCampaignDbRow>> {
  const parsed = parseStoreCouponCampaignCreateBody(rawBody);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error as StoreCouponWriterError, forbidden: parsed.forbidden };
  }
  if (!rawBody || typeof rawBody !== "object") {
    return { ok: false, error: "forbidden_fields" };
  }
  const funding = resolveAdminSupportedCreateFunding(rawBody as Record<string, unknown>);
  if (!funding.ok) {
    return { ok: false, error: funding.error };
  }

  const storeCheck = await assertStoreEligibleForDiscoveryCampaignWrite(sb, parsed.value.storeId);
  if (!storeCheck.ok) return { ok: false, error: storeCheck.error };

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(STORE_COUPON_CAMPAIGN_TABLE)
    .insert(buildInsert(parsed.value, funding.write, adminUserId, now))
    .select(SELECT_COLS)
    .single();

  if (error || !data) {
    console.error("[createStoreCouponCampaignAdmin]", error?.message);
    return { ok: false, error: "db_error" };
  }
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

export async function updateStoreCouponCampaignAdmin(
  sb: SupabaseClient,
  rawBody: unknown,
  adminUserId: string
): Promise<StoreCouponWriterResult<StoreCouponCampaignDbRow>> {
  const parsed = parseStoreCouponCampaignUpdateBody(rawBody);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error as StoreCouponWriterError, forbidden: parsed.forbidden };
  }

  const existing = await loadRow(sb, parsed.value.id);
  if (!existing.ok) return existing;

  const window = resolveStoreCouponCampaignUpdateWindow(
    { startAt: existing.row.start_at, endAt: existing.row.end_at },
    parsed.value
  );
  if (!window) return { ok: false, error: "invalid_window" };

  const patch = buildUpdate(parsed.value, window, adminUserId);
  const { data, error } = await sb
    .from(STORE_COUPON_CAMPAIGN_TABLE)
    .update(patch)
    .eq("id", parsed.value.id)
    .select(SELECT_COLS)
    .single();

  if (error || !data) {
    console.error("[updateStoreCouponCampaignAdmin]", error?.message);
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
  | { ok: true; row: StoreCouponCampaignDbRow }
  | { ok: false; error: StoreCouponWriterError }
> {
  const campaignId = String(id ?? "").trim();
  if (!campaignId) return { ok: false, error: "missing_id" };
  const { data, error } = await sb
    .from(STORE_COUPON_CAMPAIGN_TABLE)
    .select(SELECT_COLS)
    .eq("id", campaignId)
    .maybeSingle();
  if (error) {
    console.error("[loadStoreCouponRow]", error.message);
    return { ok: false, error: "db_error" };
  }
  if (!data) return { ok: false, error: "campaign_not_found" };
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, row: mapped };
}

function buildInsert(
  input: StoreCouponCampaignCreateInput,
  funding: AdminSupportedFundingWrite,
  adminUserId: string,
  now: string
) {
  return {
    store_id: input.storeId,
    title: input.title,
    discount_type: input.discountType,
    discount_value: input.discountValue,
    min_order_amount: input.minOrderAmount,
    terms_copy: input.termsCopy,
    start_at: input.startAt,
    end_at: input.endAt,
    is_active: input.isActive,
    lifecycle_state: input.isActive ? "active" : "draft",
    funding_mode: funding.funding_mode,
    requires_admin_approval: funding.requires_admin_approval,
    max_discount: input.maxDiscount,
    issue_limit: input.issueLimit,
    spend_budget_php: input.spendBudgetPhp,
    first_order_scope: input.firstOrderScope,
    usage_end_at: input.usageEndAt,
    claim_valid_days: input.claimValidDays,
    store_funded_amount: funding.store_funded_amount,
    created_by_user_id: adminUserId,
    updated_by_user_id: adminUserId,
    issuer_role: "admin",
    campaign_purpose: input.campaignPurpose,
    created_at: now,
    updated_at: now,
  };
}

function buildUpdate(
  input: StoreCouponCampaignUpdateInput,
  window: { startAt: string; endAt: string },
  adminUserId: string
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    start_at: window.startAt,
    end_at: window.endAt,
    updated_by_user_id: adminUserId,
    updated_at: new Date().toISOString(),
  };
  if (input.title !== undefined) patch.title = input.title;
  if (input.discountType !== undefined) patch.discount_type = input.discountType;
  if (input.discountValue !== undefined) patch.discount_value = input.discountValue;
  if (input.minOrderAmount !== undefined) patch.min_order_amount = input.minOrderAmount;
  if (input.termsCopy !== undefined) patch.terms_copy = input.termsCopy;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  return patch;
}

/**
 * Partner membership apply / Admin approve / reject / cancel / end.
 * Membership product only — NOT a campaign product.
 * Partner monthly fee: canonical Cash secure before PENDING_REVIEW.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_AD_PARTNER_CONFIG_TABLE,
  DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE,
  type DeliveryAdPartnerConfigRow,
  type DeliveryAdPartnerMembershipStatus,
  DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES,
  DELIVERY_AD_PARTNER_DISCOUNT_ELIGIBLE_STATUSES,
  DELIVERY_AD_PARTNER_OPEN_STATUSES,
  DELIVERY_AD_PARTNER_PERIOD_DAYS_DEFAULT,
  mapDeliveryAdPartnerMembershipRow,
  type DeliveryAdPartnerMembershipRow,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { recordDeliveryAdCommercialOverride } from "@/lib/stores/advertising/delivery-ad-commercial-admin-writer";
import {
  debitBusinessCashForDeliveryAd,
  hasCanonicalBcFundingSecured,
  refundBusinessCashForRejectedDeliveryAd,
} from "@/lib/stores/advertising/canonical-business-cash-writer";

export type PartnerMembershipWriterError =
  | "not_found"
  | "config_disabled"
  | "not_accepting"
  | "fee_not_configured"
  | "already_open"
  | "invalid_status"
  | "illegal_transition"
  | "db_error"
  | "invalid_store"
  | "INSUFFICIENT_BUSINESS_CASH"
  | "funding_required"
  | "bc_debit_failed";

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

export async function loadDeliveryAdPartnerConfig(
  sb: SupabaseClient
): Promise<DeliveryAdPartnerConfigRow | null> {
  const { data, error } = await sb
    .from(DELIVERY_AD_PARTNER_CONFIG_TABLE)
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) return null;
  return mapPartnerConfig(data as Record<string, unknown> | null);
}

export async function loadPartnerMembershipById(
  sb: SupabaseClient,
  membershipId: string
): Promise<DeliveryAdPartnerMembershipRow | null> {
  const { data, error } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .select("*")
    .eq("id", membershipId)
    .maybeSingle();
  if (error || !data) return null;
  return mapDeliveryAdPartnerMembershipRow(data as Record<string, unknown>);
}

export async function loadOpenPartnerMembershipForStore(
  sb: SupabaseClient,
  storeId: string
): Promise<DeliveryAdPartnerMembershipRow | null> {
  const { data, error } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .select("*")
    .eq("store_id", storeId)
    .in("status", [...DELIVERY_AD_PARTNER_OPEN_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapDeliveryAdPartnerMembershipRow(data as Record<string, unknown>);
}

export async function loadLatestPartnerMembershipForStore(
  sb: SupabaseClient,
  storeId: string
): Promise<DeliveryAdPartnerMembershipRow | null> {
  const { data, error } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapDeliveryAdPartnerMembershipRow(data as Record<string, unknown>);
}

export async function listPartnerMembershipsForAdmin(
  sb: SupabaseClient,
  filters: {
    status?: DeliveryAdPartnerMembershipStatus | "open" | "all";
    storeId?: string;
    limit?: number;
  } = {}
): Promise<{ items: DeliveryAdPartnerMembershipRow[]; error?: string }> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 300);
  let q = sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (filters.storeId) q = q.eq("store_id", filters.storeId);
  if (filters.status === "open") {
    q = q.in("status", [...DELIVERY_AD_PARTNER_OPEN_STATUSES]);
  } else if (
    filters.status &&
    filters.status !== "all" &&
    (DELIVERY_AD_PARTNER_MEMBERSHIP_STATUSES as readonly string[]).includes(filters.status)
  ) {
    q = q.eq("status", filters.status);
  }
  const { data, error } = await q;
  if (error) return { items: [], error: error.message };
  const items = (data ?? [])
    .map((r) => mapDeliveryAdPartnerMembershipRow(r as Record<string, unknown>))
    .filter((r): r is DeliveryAdPartnerMembershipRow => r != null);
  return { items };
}

/**
 * Owner apply — Cash secure exactly once, then PENDING_REVIEW.
 * Insufficient Cash → no PENDING_REVIEW intake (row deleted).
 */
export async function ownerApplyPartnerMembership(
  sb: SupabaseClient,
  input: { storeId: string; actorUserId: string }
): Promise<
  | {
      ok: true;
      membership: DeliveryAdPartnerMembershipRow;
      payment: "BUSINESS_CASH_SECURED";
      amountMinor: number;
    }
  | {
      ok: false;
      error: PartnerMembershipWriterError;
      detail?: string;
      insufficient?: {
        availableMinor: number;
        requiredMinor: number;
        shortageMinor: number;
      };
    }
> {
  const storeId = input.storeId.trim();
  if (!storeId) return { ok: false, error: "invalid_store" };

  const config = await loadDeliveryAdPartnerConfig(sb);
  if (!config || !config.enabled) return { ok: false, error: "config_disabled" };
  if (!config.acceptingNewMembers) return { ok: false, error: "not_accepting" };
  if (config.monthlyFeeMinor == null || config.monthlyFeeMinor <= 0) {
    return { ok: false, error: "fee_not_configured" };
  }

  const open = await loadOpenPartnerMembershipForStore(sb, storeId);
  if (open) return { ok: false, error: "already_open" };

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .insert({
      store_id: storeId,
      status: "PENDING_REVIEW",
      period_start: null,
      period_end: null,
      fee_snapshot_minor: config.monthlyFeeMinor,
      currency: config.currency,
      benefit_snapshot: {},
      advertising_discount_percent_snapshot: 0,
      config_version_snapshot: config.version,
      cancel_requested_at: null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "db_error", detail: error?.message };
  }
  const membership = mapDeliveryAdPartnerMembershipRow(data as Record<string, unknown>);
  if (!membership) return { ok: false, error: "db_error", detail: "invalid_row" };

  const secured = await debitBusinessCashForDeliveryAd(sb, {
    ownerUserId: input.actorUserId,
    storeId,
    applicationId: membership.id,
    productKind: "partner",
    amountMinor: config.monthlyFeeMinor,
  });
  if (!secured.ok) {
    await sb.from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE).delete().eq("id", membership.id);
    if (secured.error === "INSUFFICIENT_BUSINESS_CASH" && secured.insufficient) {
      return {
        ok: false,
        error: "INSUFFICIENT_BUSINESS_CASH",
        insufficient: {
          availableMinor: secured.insufficient.availableMinor,
          requiredMinor: secured.insufficient.requiredMinor,
          shortageMinor: secured.insufficient.shortageMinor,
        },
      };
    }
    return {
      ok: false,
      error: "bc_debit_failed",
      detail: secured.detail ?? secured.error,
    };
  }

  await recordDeliveryAdCommercialOverride(sb, {
    entityType: "partner_membership",
    entityId: membership.id,
    actorUserId: input.actorUserId,
    reason: "owner_partner_apply",
    before: {},
    after: {
      status: membership.status,
      store_id: membership.storeId,
      payment: "BUSINESS_CASH_SECURED",
      amount_minor: secured.amountMinor,
      funding_id: secured.fundingId,
    },
  });

  return {
    ok: true,
    membership,
    payment: "BUSINESS_CASH_SECURED",
    amountMinor: secured.amountMinor,
  };
}

export async function ownerRequestPartnerMembershipCancel(
  sb: SupabaseClient,
  input: { storeId: string; membershipId: string; actorUserId: string }
): Promise<
  | { ok: true; membership: DeliveryAdPartnerMembershipRow }
  | { ok: false; error: PartnerMembershipWriterError; detail?: string }
> {
  const row = await loadPartnerMembershipById(sb, input.membershipId);
  if (!row || row.storeId !== input.storeId) return { ok: false, error: "not_found" };
  if (row.status !== "ACTIVE") return { ok: false, error: "illegal_transition" };

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .update({
      status: "CANCEL_PENDING",
      cancel_requested_at: now,
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("status", "ACTIVE")
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "db_error", detail: error?.message };
  }
  const membership = mapDeliveryAdPartnerMembershipRow(data as Record<string, unknown>);
  if (!membership) return { ok: false, error: "db_error" };

  await recordDeliveryAdCommercialOverride(sb, {
    entityType: "partner_membership",
    entityId: membership.id,
    actorUserId: input.actorUserId,
    reason: "owner_partner_cancel_request",
    before: { status: row.status },
    after: { status: membership.status, cancel_requested_at: now },
  });

  return { ok: true, membership };
}

/** Admin approve PENDING_REVIEW → ACTIVE; requires canonical Cash funding SECURED. */
export async function adminApprovePartnerMembership(
  sb: SupabaseClient,
  input: {
    membershipId: string;
    actorUserId: string;
    reason: string;
    periodDays?: number;
  }
): Promise<
  | { ok: true; membership: DeliveryAdPartnerMembershipRow }
  | { ok: false; error: PartnerMembershipWriterError; detail?: string }
> {
  const row = await loadPartnerMembershipById(sb, input.membershipId);
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "PENDING_REVIEW") return { ok: false, error: "illegal_transition" };

  const funded = await hasCanonicalBcFundingSecured(sb, {
    productKind: "partner",
    applicationId: row.id,
    storeId: row.storeId,
  });
  if (!funded) return { ok: false, error: "funding_required" };

  const config = await loadDeliveryAdPartnerConfig(sb);
  if (!config || !config.enabled) return { ok: false, error: "config_disabled" };
  if (config.monthlyFeeMinor == null || config.monthlyFeeMinor < 0) {
    return { ok: false, error: "fee_not_configured" };
  }

  const days =
    input.periodDays != null && Number.isInteger(input.periodDays) && input.periodDays > 0
      ? input.periodDays
      : DELIVERY_AD_PARTNER_PERIOD_DAYS_DEFAULT;
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const now = start.toISOString();

  const { data, error } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .update({
      status: "ACTIVE",
      period_start: now,
      period_end: end.toISOString(),
      fee_snapshot_minor: row.feeSnapshotMinor ?? config.monthlyFeeMinor,
      currency: config.currency,
      benefit_snapshot: config.benefitJson,
      advertising_discount_percent_snapshot: config.advertisingDiscountPercent,
      config_version_snapshot: config.version,
      cancel_requested_at: null,
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("status", "PENDING_REVIEW")
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "db_error", detail: error?.message };
  }
  const membership = mapDeliveryAdPartnerMembershipRow(data as Record<string, unknown>);
  if (!membership) return { ok: false, error: "db_error" };

  await recordDeliveryAdCommercialOverride(sb, {
    entityType: "partner_membership",
    entityId: membership.id,
    actorUserId: input.actorUserId,
    reason: input.reason.trim() || "admin_partner_approve",
    before: { status: row.status },
    after: {
      status: membership.status,
      fee_snapshot_minor: membership.feeSnapshotMinor,
      advertising_discount_percent_snapshot: membership.advertisingDiscountPercentSnapshot,
      config_version_snapshot: membership.configVersionSnapshot,
      period_start: membership.periodStart,
      period_end: membership.periodEnd,
      payment: "BUSINESS_CASH_SECURED",
    },
  });

  return { ok: true, membership };
}

/**
 * Admin reject PENDING_REVIEW → REJECTED + exactly-once Cash refund.
 * REJECTED ≠ ENDED (application outcome vs membership end).
 */
export async function adminRejectPartnerMembership(
  sb: SupabaseClient,
  input: { membershipId: string; actorUserId: string; reason: string }
): Promise<
  | { ok: true; membership: DeliveryAdPartnerMembershipRow; refundIdempotent: boolean }
  | { ok: false; error: PartnerMembershipWriterError; detail?: string }
> {
  const row = await loadPartnerMembershipById(sb, input.membershipId);
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "PENDING_REVIEW") return { ok: false, error: "illegal_transition" };

  const refund = await refundBusinessCashForRejectedDeliveryAd(sb, {
    adminUserId: input.actorUserId,
    applicationId: row.id,
    productKind: "partner",
  });
  if (!refund.ok && refund.error !== "funding_not_found") {
    return { ok: false, error: "db_error", detail: refund.detail ?? refund.error };
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .update({
      status: "REJECTED",
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("status", "PENDING_REVIEW")
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "db_error", detail: error?.message };
  }
  const membership = mapDeliveryAdPartnerMembershipRow(data as Record<string, unknown>);
  if (!membership) return { ok: false, error: "db_error" };

  await recordDeliveryAdCommercialOverride(sb, {
    entityType: "partner_membership",
    entityId: membership.id,
    actorUserId: input.actorUserId,
    reason: input.reason.trim() || "admin_partner_reject",
    before: { status: row.status },
    after: {
      status: membership.status,
      refund: refund.ok,
      refund_idempotent: refund.ok ? refund.idempotent : false,
    },
  });

  return {
    ok: true,
    membership,
    refundIdempotent: refund.ok ? refund.idempotent : false,
  };
}

/** Admin end ACTIVE | CANCEL_PENDING | PAST_DUE → ENDED. Not for PENDING_REVIEW reject. */
export async function adminEndPartnerMembership(
  sb: SupabaseClient,
  input: { membershipId: string; actorUserId: string; reason: string }
): Promise<
  | { ok: true; membership: DeliveryAdPartnerMembershipRow }
  | { ok: false; error: PartnerMembershipWriterError; detail?: string }
> {
  const row = await loadPartnerMembershipById(sb, input.membershipId);
  if (!row) return { ok: false, error: "not_found" };
  if (
    row.status !== "ACTIVE" &&
    row.status !== "CANCEL_PENDING" &&
    row.status !== "PAST_DUE"
  ) {
    return { ok: false, error: "illegal_transition" };
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .update({
      status: "ENDED",
      updated_at: now,
    })
    .eq("id", row.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "db_error", detail: error?.message };
  }
  const membership = mapDeliveryAdPartnerMembershipRow(data as Record<string, unknown>);
  if (!membership) return { ok: false, error: "db_error" };

  await recordDeliveryAdCommercialOverride(sb, {
    entityType: "partner_membership",
    entityId: membership.id,
    actorUserId: input.actorUserId,
    reason: input.reason.trim() || "admin_partner_end",
    before: { status: row.status },
    after: { status: membership.status },
  });

  return { ok: true, membership };
}

export function partnerMembershipAdminFilterLabel(
  status: DeliveryAdPartnerMembershipStatus,
  lang: "ko" | "en"
): string {
  switch (status) {
    case "PENDING_REVIEW":
      return lang === "en" ? "Pending review" : "가입 대기";
    case "ACTIVE":
      return lang === "en" ? "Active" : "이용 중";
    case "CANCEL_PENDING":
      return lang === "en" ? "Cancel pending" : "해지 예정";
    case "ENDED":
      return lang === "en" ? "Ended" : "종료";
    case "REJECTED":
      return lang === "en" ? "Rejected" : "거절";
    case "PAST_DUE":
      return lang === "en" ? "Past due" : "연체";
    case "NONE":
    default:
      return lang === "en" ? "None" : "없음";
  }
}

export function partnerMembershipGrantsAdvertisingDiscount(
  status: DeliveryAdPartnerMembershipStatus
): boolean {
  return (DELIVERY_AD_PARTNER_DISCOUNT_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

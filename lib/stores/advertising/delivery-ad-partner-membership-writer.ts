/**
 * Partner membership apply / Admin approve / reject / cancel / end.
 * Membership product only — NOT a campaign product.
 * Partner monthly fee: canonical Cash secure before PENDING_REVIEW.
 */

import { randomUUID } from "node:crypto";
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
  DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE,
  parseInsufficientBusinessCashRpc,
} from "@/lib/stores/advertising/canonical-business-cash-contract";

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
  | "bc_debit_failed"
  | "idempotency_key_required"
  | "forbidden"
  | "refund_failed";

/** 3-D2 (ADS-03/04/05) — money steps are single SQL transactions; TS only calls these. */
export const OWNER_APPLY_PARTNER_MEMBERSHIP_RPC = "owner_apply_partner_membership" as const;
export const ADMIN_PARTNER_MEMBERSHIP_DECIDE_RPC = "admin_partner_membership_decide" as const;
export const PARTNER_MEMBERSHIP_EXPIRE_DUE_RPC = "delivery_ad_partner_membership_expire_due" as const;

const PARTNER_WRITER_ERRORS: ReadonlySet<string> = new Set<PartnerMembershipWriterError>([
  "not_found",
  "config_disabled",
  "not_accepting",
  "fee_not_configured",
  "already_open",
  "invalid_status",
  "illegal_transition",
  "db_error",
  "invalid_store",
  "INSUFFICIENT_BUSINESS_CASH",
  "funding_required",
  "bc_debit_failed",
  "idempotency_key_required",
  "forbidden",
  "refund_failed",
]);

function rpcPayload(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

function mapRpcError(payload: Record<string, unknown> | null): PartnerMembershipWriterError {
  const code = typeof payload?.error === "string" ? payload.error : "";
  if (PARTNER_WRITER_ERRORS.has(code)) return code as PartnerMembershipWriterError;
  // other debit-stage failures from business_cash_delivery_ad_spend
  if (payload?.stage === "debit") return "bc_debit_failed";
  return "db_error";
}

/**
 * ADS-05 — read-time derivation (same rule as the advertising discount check in
 * delivery-ad-commercial-catalog): ACTIVE / CANCEL_PENDING whose period_end has passed is NOT open,
 * even when the stored status was never transitioned (D-5 legacy rows stay as they are).
 */
export function isPartnerMembershipPeriodExpired(
  row: Pick<DeliveryAdPartnerMembershipRow, "status" | "periodEnd">,
  nowMs: number = Date.now()
): boolean {
  if (row.status !== "ACTIVE" && row.status !== "CANCEL_PENDING") return false;
  if (!row.periodEnd) return false;
  const end = Date.parse(row.periodEnd);
  return Number.isFinite(end) && end <= nowMs;
}

export function isPartnerMembershipEffectivelyOpen(
  row: Pick<DeliveryAdPartnerMembershipRow, "status" | "periodEnd">,
  nowMs: number = Date.now()
): boolean {
  if (!(DELIVERY_AD_PARTNER_OPEN_STATUSES as readonly string[]).includes(row.status)) return false;
  return !isPartnerMembershipPeriodExpired(row, nowMs);
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
    .limit(10);
  if (error || !data) return null;
  const nowMs = Date.now();
  for (const raw of data as Record<string, unknown>[]) {
    const row = mapDeliveryAdPartnerMembershipRow(raw);
    if (row && isPartnerMembershipEffectivelyOpen(row, nowMs)) return row;
  }
  return null;
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
 * Owner apply — ADS-04: `owner_apply_partner_membership` creates the PENDING_REVIEW row and debits Cash in ONE
 * transaction (idempotent per requestId; one open membership per store enforced by the DB). No TS compensation.
 */
export async function ownerApplyPartnerMembership(
  sb: SupabaseClient,
  input: { storeId: string; actorUserId: string; requestId?: string | null }
): Promise<
  | {
      ok: true;
      membership: DeliveryAdPartnerMembershipRow;
      payment: "BUSINESS_CASH_SECURED";
      amountMinor: number;
      idempotent: boolean;
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
  const requestId = String(input.requestId ?? "").trim().slice(0, 200) || randomUUID();

  const { data, error } = await sb.rpc(OWNER_APPLY_PARTNER_MEMBERSHIP_RPC, {
    p_store_id: storeId,
    p_owner_user_id: input.actorUserId,
    p_request_id: requestId,
  });
  if (error) return { ok: false, error: "db_error", detail: error.message };
  const payload = rpcPayload(data);
  if (!payload || payload.ok !== true) {
    const insufficient = parseInsufficientBusinessCashRpc(payload);
    if (insufficient) {
      return {
        ok: false,
        error: "INSUFFICIENT_BUSINESS_CASH",
        insufficient: {
          availableMinor: insufficient.availableMinor,
          requiredMinor: insufficient.requiredMinor,
          shortageMinor: insufficient.shortageMinor,
        },
      };
    }
    return {
      ok: false,
      error: mapRpcError(payload),
      detail: typeof payload?.error === "string" ? payload.error : undefined,
    };
  }
  const membership = mapDeliveryAdPartnerMembershipRow(rpcPayload(payload.membership) ?? {});
  if (!membership) return { ok: false, error: "db_error", detail: "invalid_row" };
  return {
    ok: true,
    membership,
    payment: "BUSINESS_CASH_SECURED",
    amountMinor: Math.trunc(Number(payload.amount_minor) || 0),
    idempotent: payload.idempotent === true,
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
  if (isPartnerMembershipPeriodExpired(row)) return { ok: false, error: "illegal_transition" };

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

async function callAdminPartnerDecide(
  sb: SupabaseClient,
  input: {
    membershipId: string;
    actorUserId: string;
    action: "approve" | "reject";
    reason: string;
    periodDays?: number;
  }
): Promise<
  | { ok: true; payload: Record<string, unknown>; membership: DeliveryAdPartnerMembershipRow }
  | { ok: false; error: PartnerMembershipWriterError; detail?: string }
> {
  const days =
    input.periodDays != null && Number.isInteger(input.periodDays) && input.periodDays > 0
      ? input.periodDays
      : DELIVERY_AD_PARTNER_PERIOD_DAYS_DEFAULT;
  const { data, error } = await sb.rpc(ADMIN_PARTNER_MEMBERSHIP_DECIDE_RPC, {
    p_admin_user_id: input.actorUserId,
    p_membership_id: input.membershipId,
    p_action: input.action,
    p_reason: input.reason.trim() || `admin_partner_${input.action}`,
    p_period_days: input.action === "approve" ? days : null,
  });
  if (error) return { ok: false, error: "db_error", detail: error.message };
  const payload = rpcPayload(data);
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      error: mapRpcError(payload),
      detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    };
  }
  const membership = mapDeliveryAdPartnerMembershipRow(rpcPayload(payload.membership) ?? {});
  if (!membership) return { ok: false, error: "db_error", detail: "invalid_row" };
  return { ok: true, payload, membership };
}

/**
 * Admin approve PENDING_REVIEW → ACTIVE — ADS-03: `admin_partner_membership_decide` locks the membership,
 * re-checks canonical Cash funding SECURED and writes ACTIVE + audit in one transaction.
 */
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
  const res = await callAdminPartnerDecide(sb, { ...input, action: "approve" });
  if (!res.ok) return res;
  return { ok: true, membership: res.membership };
}

/**
 * Admin reject PENDING_REVIEW → REJECTED + exactly-once Cash refund — ADS-03: refund and status change are the
 * SAME transaction (`admin_partner_membership_decide`), serialised with approve on the membership row lock.
 * REJECTED ≠ ENDED (application outcome vs membership end).
 */
export async function adminRejectPartnerMembership(
  sb: SupabaseClient,
  input: { membershipId: string; actorUserId: string; reason: string }
): Promise<
  | { ok: true; membership: DeliveryAdPartnerMembershipRow; refundIdempotent: boolean }
  | { ok: false; error: PartnerMembershipWriterError; detail?: string }
> {
  const res = await callAdminPartnerDecide(sb, { ...input, action: "reject" });
  if (!res.ok) return res;
  return {
    ok: true,
    membership: res.membership,
    refundIdempotent: res.payload.refund_idempotent === true,
  };
}

/**
 * ADS-05 — cron: ACTIVE / CANCEL_PENDING whose period ended → ENDED (system audit), only rows whose period ends
 * after the apply instant (D-5: existing expired rows are left as they are and derived as expired at read time).
 */
export async function runPartnerMembershipExpiryBatch(
  sb: SupabaseClient,
  input: { limit?: number } = {}
): Promise<{ ok: true; ended: number } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc(PARTNER_MEMBERSHIP_EXPIRE_DUE_RPC, {
    p_limit: Math.min(Math.max(Math.trunc(input.limit ?? 200), 1), 1000),
  });
  if (error) return { ok: false, error: error.message };
  const payload = rpcPayload(data);
  if (!payload || payload.ok !== true) return { ok: false, error: "expire_failed" };
  return { ok: true, ended: Math.trunc(Number(payload.ended) || 0) };
}

export type OrphanPartnerFundingRow = {
  fundingId: string;
  applicationId: string;
  storeId: string;
  status: string;
  amountMinor: number;
  securedAt: string | null;
};

/** ADS-04 — partner fundings with no membership row (expected 0; shown to admins for manual recovery). */
export async function listOrphanPartnerFundingsForAdmin(
  sb: SupabaseClient
): Promise<{ items: OrphanPartnerFundingRow[]; error?: string }> {
  const { data, error } = await sb
    .from(DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE)
    .select("id, application_id, store_id, status, amount_minor, secured_at")
    .eq("product_kind", "partner")
    .order("secured_at", { ascending: false })
    .limit(500);
  if (error) return { items: [], error: error.message };
  const rows = (data ?? []) as Array<{
    id: string;
    application_id: string;
    store_id: string;
    status: string;
    amount_minor: number;
    secured_at: string | null;
  }>;
  if (!rows.length) return { items: [] };
  const ids = [...new Set(rows.map((r) => String(r.application_id)))];
  const { data: mem, error: memErr } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .select("id")
    .in("id", ids);
  if (memErr) return { items: [], error: memErr.message };
  const known = new Set((mem ?? []).map((m) => String((m as { id: string }).id)));
  return {
    items: rows
      .filter((r) => !known.has(String(r.application_id)))
      .map((r) => ({
        fundingId: String(r.id),
        applicationId: String(r.application_id),
        storeId: String(r.store_id),
        status: String(r.status),
        amountMinor: Math.trunc(Number(r.amount_minor) || 0),
        securedAt: r.secured_at == null ? null : String(r.secured_at),
      })),
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

/** ADS-05 — label with the read-time expiry derivation (ACTIVE past period_end -> expired). */
export function partnerMembershipEffectiveStatusLabel(
  row: Pick<DeliveryAdPartnerMembershipRow, "status" | "periodEnd">,
  lang: "ko" | "en",
  nowMs: number = Date.now()
): string {
  if (isPartnerMembershipPeriodExpired(row, nowMs)) {
    return lang === "en" ? "Expired" : "기간 만료";
  }
  return partnerMembershipAdminFilterLabel(row.status, lang);
}

export function partnerMembershipGrantsAdvertisingDiscount(
  status: DeliveryAdPartnerMembershipStatus
): boolean {
  return (DELIVERY_AD_PARTNER_DISCOUNT_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

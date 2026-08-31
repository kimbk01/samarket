/**
 * Owner Business Cash charge-request writers (structured top-up ≠ CUT3 thread).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertDeliveryAdCashChargeAmountMajor,
  type DeliveryAdCashChargeRequestStatus,
} from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";
import { adminCreditBusinessCash } from "@/lib/stores/advertising/delivery-ad-business-cash-writer";

export const DELIVERY_AD_CASH_CHARGE_REQUEST_TABLE =
  "delivery_ad_business_cash_charge_requests" as const;

export type DeliveryAdCashChargeRequestRow = {
  id: string;
  ownerUserId: string;
  amountMinor: number;
  currency: string;
  requestStatus: DeliveryAdCashChargeRequestStatus;
  ownerMemo: string | null;
  adminMemo: string | null;
  paymentReference: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  creditedLedgerId: string | null;
  clientRequestId: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(raw: Record<string, unknown>): DeliveryAdCashChargeRequestRow | null {
  const id = String(raw.id ?? "").trim();
  const ownerUserId = String(raw.owner_user_id ?? "").trim();
  const amountMinor = Number(raw.amount_minor);
  const status = String(raw.request_status ?? "").trim() as DeliveryAdCashChargeRequestStatus;
  if (!id || !ownerUserId || !Number.isFinite(amountMinor)) return null;
  return {
    id,
    ownerUserId,
    amountMinor,
    currency: String(raw.currency ?? "PHP"),
    requestStatus: status,
    ownerMemo: raw.owner_memo == null ? null : String(raw.owner_memo),
    adminMemo: raw.admin_memo == null ? null : String(raw.admin_memo),
    paymentReference: raw.payment_reference == null ? null : String(raw.payment_reference),
    reviewedBy: raw.reviewed_by == null ? null : String(raw.reviewed_by),
    reviewedAt: raw.reviewed_at == null ? null : String(raw.reviewed_at),
    creditedLedgerId: raw.credited_ledger_id == null ? null : String(raw.credited_ledger_id),
    clientRequestId: raw.client_request_id == null ? null : String(raw.client_request_id),
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
  };
}

export async function createOwnerBusinessCashChargeRequest(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    amountMajor: number;
    ownerMemo?: string | null;
    clientRequestId?: string | null;
  }
): Promise<
  | { ok: true; row: DeliveryAdCashChargeRequestRow }
  | {
      ok: false;
      error:
        | "invalid_amount"
        | "db_error"
        | "duplicate"
        | "DISABLED_FOR_NEW_PRODUCT";
    }
> {
  // Stage 1 — Ads Business Cash charge-request REJECTED as product authority.
  // Historical rows preserved; no new product funding via this path.
  void sb;
  void input;
  return { ok: false, error: "DISABLED_FOR_NEW_PRODUCT" };
}

/** @deprecated Stage 1 — kept for migration/admin historical readers only; do not call for new product. */
export async function createOwnerBusinessCashChargeRequestLegacyUnrestricted(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    amountMajor: number;
    ownerMemo?: string | null;
    clientRequestId?: string | null;
  }
): Promise<
  | { ok: true; row: DeliveryAdCashChargeRequestRow }
  | { ok: false; error: "invalid_amount" | "db_error" | "duplicate" }
> {
  if (!assertDeliveryAdCashChargeAmountMajor(input.amountMajor)) {
    return { ok: false, error: "invalid_amount" };
  }
  const amountMinor = input.amountMajor * 100;
  const clientRequestId =
    typeof input.clientRequestId === "string" && input.clientRequestId.trim()
      ? input.clientRequestId.trim().slice(0, 128)
      : null;

  const { data, error } = await sb
    .from(DELIVERY_AD_CASH_CHARGE_REQUEST_TABLE)
    .insert({
      owner_user_id: input.ownerUserId,
      amount_minor: amountMinor,
      currency: "PHP",
      request_status: "pending_deposit",
      owner_memo: input.ownerMemo?.trim() || null,
      client_request_id: clientRequestId,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (/unique|duplicate/i.test(String(error.message))) return { ok: false, error: "duplicate" };
    if (/does not exist|schema cache/i.test(String(error.message))) {
      return { ok: false, error: "db_error" };
    }
    console.error("[createOwnerBusinessCashChargeRequest]", error.message);
    return { ok: false, error: "db_error" };
  }
  const row = data ? mapRow(data as Record<string, unknown>) : null;
  if (!row) return { ok: false, error: "db_error" };
  return { ok: true, row };
}

export async function listOwnerBusinessCashChargeRequests(
  sb: SupabaseClient,
  ownerUserId: string
): Promise<DeliveryAdCashChargeRequestRow[]> {
  const { data, error } = await sb
    .from(DELIVERY_AD_CASH_CHARGE_REQUEST_TABLE)
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((r): r is DeliveryAdCashChargeRequestRow => r != null);
}

export async function listAdminBusinessCashChargeRequests(
  sb: SupabaseClient,
  status?: DeliveryAdCashChargeRequestStatus | "open"
): Promise<DeliveryAdCashChargeRequestRow[]> {
  let q = sb
    .from(DELIVERY_AD_CASH_CHARGE_REQUEST_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status === "open") {
    q = q.in("request_status", ["pending_deposit", "under_review"]);
  } else if (status) {
    q = q.eq("request_status", status);
  }
  const { data, error } = await q;
  if (error) return [];
  return (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((r): r is DeliveryAdCashChargeRequestRow => r != null);
}

export async function adminCompleteBusinessCashChargeRequest(
  sb: SupabaseClient,
  input: {
    requestId: string;
    adminUserId: string;
    adminMemo?: string | null;
  }
): Promise<
  | { ok: true; row: DeliveryAdCashChargeRequestRow }
  | { ok: false; error: "not_found" | "invalid_status" | "credit_failed" | "db_error" }
> {
  const { data: raw, error } = await sb
    .from(DELIVERY_AD_CASH_CHARGE_REQUEST_TABLE)
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error || !raw) return { ok: false, error: "not_found" };
  const current = mapRow(raw as Record<string, unknown>);
  if (!current) return { ok: false, error: "not_found" };
  if (current.requestStatus !== "pending_deposit" && current.requestStatus !== "under_review") {
    return { ok: false, error: "invalid_status" };
  }

  const credit = await adminCreditBusinessCash(sb, {
    adminUserId: input.adminUserId,
    ownerUserId: current.ownerUserId,
    amountMinor: current.amountMinor,
    reason: `cash_charge_request:${current.id}`,
    nonce: current.id,
  });
  if (!credit.ok) return { ok: false, error: "credit_failed" };

  const { data: updated, error: upErr } = await sb
    .from(DELIVERY_AD_CASH_CHARGE_REQUEST_TABLE)
    .update({
      request_status: "completed",
      admin_memo: input.adminMemo?.trim() || null,
      reviewed_by: input.adminUserId,
      reviewed_at: new Date().toISOString(),
      credited_ledger_id: credit.ledgerId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select("*")
    .maybeSingle();
  if (upErr || !updated) return { ok: false, error: "db_error" };
  const row = mapRow(updated as Record<string, unknown>);
  if (!row) return { ok: false, error: "db_error" };
  return { ok: true, row };
}

export async function adminRejectBusinessCashChargeRequest(
  sb: SupabaseClient,
  input: {
    requestId: string;
    adminUserId: string;
    adminMemo?: string | null;
  }
): Promise<
  | { ok: true; row: DeliveryAdCashChargeRequestRow }
  | { ok: false; error: "not_found" | "invalid_status" | "db_error" }
> {
  const { data: raw, error } = await sb
    .from(DELIVERY_AD_CASH_CHARGE_REQUEST_TABLE)
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();
  if (error || !raw) return { ok: false, error: "not_found" };
  const current = mapRow(raw as Record<string, unknown>);
  if (!current) return { ok: false, error: "not_found" };
  if (current.requestStatus !== "pending_deposit" && current.requestStatus !== "under_review") {
    return { ok: false, error: "invalid_status" };
  }
  const { data: updated, error: upErr } = await sb
    .from(DELIVERY_AD_CASH_CHARGE_REQUEST_TABLE)
    .update({
      request_status: "rejected",
      admin_memo: input.adminMemo?.trim() || null,
      reviewed_by: input.adminUserId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select("*")
    .maybeSingle();
  if (upErr || !updated) return { ok: false, error: "db_error" };
  const row = mapRow(updated as Record<string, unknown>);
  if (!row) return { ok: false, error: "db_error" };
  return { ok: true, row };
}

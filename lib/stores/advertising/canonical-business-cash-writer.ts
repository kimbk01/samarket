/**
 * AST-004 / AST-005 writers — service_role RPC only for mutations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APPROVE_BC_CHARGE_RPC,
  BC_DELIVERY_AD_REFUND_RPC,
  BC_DELIVERY_AD_SPEND_RPC,
  BUSINESS_CASH_ACCOUNTS_TABLE,
  BUSINESS_CASH_CHARGE_REQUESTS_TABLE,
  BUSINESS_CASH_CONVERSION_RATE_POLICIES_TABLE,
  BUSINESS_CASH_LEDGER_TABLE,
  CONVERT_SP_TO_BC_RPC,
  DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE,
  GET_BC_CONVERSION_RATE_RPC,
  REJECT_BC_CHARGE_RPC,
  STORE_ECONOMIC_POINT_ACCOUNTS_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
  computeBusinessCashFromStorePoints,
  isDefaultConversionRate,
  parseInsufficientBusinessCashRpc,
  resolveFundingStatusFromCanonicalBc,
  type BusinessCashConversionQuote,
  type InsufficientBusinessCashPayload,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import type { DeliveryAdFundingStatus } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";

export async function loadStoreBusinessCashBalance(
  sb: SupabaseClient,
  storeId: string
): Promise<{ balanceMinor: number; currency: "PHP" }> {
  const sid = String(storeId ?? "").trim();
  if (!sid) return { balanceMinor: 0, currency: "PHP" };
  const { data, error } = await sb
    .from(BUSINESS_CASH_ACCOUNTS_TABLE)
    .select("balance_minor")
    .eq("store_id", sid)
    .maybeSingle();
  if (error) {
    if (/business_cash_accounts|schema cache|does not exist/i.test(String(error.message))) {
      return { balanceMinor: 0, currency: "PHP" };
    }
    console.error("[loadStoreBusinessCashBalance]", error.message);
    return { balanceMinor: 0, currency: "PHP" };
  }
  return {
    balanceMinor: Math.trunc(Number((data as { balance_minor?: number } | null)?.balance_minor) || 0),
    currency: "PHP",
  };
}

export async function loadStoreEconomicPointsBalance(
  sb: SupabaseClient,
  storeId: string
): Promise<{ balance: number }> {
  const sid = String(storeId ?? "").trim();
  if (!sid) return { balance: 0 };
  const { data, error } = await sb
    .from(STORE_ECONOMIC_POINT_ACCOUNTS_TABLE)
    .select("balance")
    .eq("store_id", sid)
    .maybeSingle();
  if (error) {
    if (/store_economic_point_accounts|schema cache|does not exist/i.test(String(error.message))) {
      return { balance: 0 };
    }
    console.error("[loadStoreEconomicPointsBalance]", error.message);
    return { balance: 0 };
  }
  return { balance: Math.trunc(Number((data as { balance?: number } | null)?.balance) || 0) };
}

export async function loadBusinessCashConversionRate(
  sb: SupabaseClient
): Promise<{
  ratePesosPerPoint: number;
  version: number;
  isDefaultRate: boolean;
  effectiveFrom: string | null;
} | null> {
  const { data, error } = await sb.rpc(GET_BC_CONVERSION_RATE_RPC);
  if (!error && data && typeof data === "object") {
    const payload = data as Record<string, unknown>;
    if (payload.ok === true || payload.rate_pesos_per_point != null) {
      const rate = Number(payload.rate_pesos_per_point);
      return {
        ratePesosPerPoint: Number.isFinite(rate) && rate > 0 ? rate : 1,
        version: Math.trunc(Number(payload.version) || 1),
        isDefaultRate: payload.is_default_rate === true || isDefaultConversionRate(rate),
        effectiveFrom:
          payload.effective_from == null ? null : String(payload.effective_from),
      };
    }
  }
  const { data: row } = await sb
    .from(BUSINESS_CASH_CONVERSION_RATE_POLICIES_TABLE)
    .select("rate_pesos_per_point, version, effective_from")
    .eq("id", "default")
    .maybeSingle();
  if (!row) return { ratePesosPerPoint: 1, version: 1, isDefaultRate: true, effectiveFrom: null };
  const rate = Number((row as { rate_pesos_per_point?: number }).rate_pesos_per_point);
  return {
    ratePesosPerPoint: Number.isFinite(rate) && rate > 0 ? rate : 1,
    version: Math.trunc(Number((row as { version?: number }).version) || 1),
    isDefaultRate: isDefaultConversionRate(rate),
    effectiveFrom:
      (row as { effective_from?: string | null }).effective_from == null
        ? null
        : String((row as { effective_from: string }).effective_from),
  };
}

export async function buildOwnerConversionDisclosure(
  sb: SupabaseClient,
  input: { storeId: string; requestedPoints: number; previousRateVersion?: number | null }
): Promise<BusinessCashConversionQuote | null> {
  const rate = await loadBusinessCashConversionRate(sb);
  if (!rate) return null;
  const [sp, bc] = await Promise.all([
    loadStoreEconomicPointsBalance(sb, input.storeId),
    loadStoreBusinessCashBalance(sb, input.storeId),
  ]);
  const requested = Math.max(0, Math.trunc(input.requestedPoints));
  const expected = computeBusinessCashFromStorePoints({
    points: requested,
    ratePesosPerPoint: rate.ratePesosPerPoint,
  });
  const rateChangedNoticeRequired =
    !rate.isDefaultRate ||
    (input.previousRateVersion != null &&
      Number.isFinite(input.previousRateVersion) &&
      input.previousRateVersion !== rate.version);
  return {
    ratePesosPerPoint: rate.ratePesosPerPoint,
    version: rate.version,
    isDefaultRate: rate.isDefaultRate,
    effectiveFrom: rate.effectiveFrom,
    storePointsBalance: sp.balance,
    businessCashBalanceMinor: bc.balanceMinor,
    requestedPoints: requested,
    expectedBusinessCashMinor: expected,
    rateChangedNoticeRequired,
  };
}

export async function convertStorePointsToBusinessCash(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    storeId: string;
    points: number;
    expectedRateVersion: number;
    idempotencyKey: string;
  }
): Promise<
  | {
      ok: true;
      idempotent: boolean;
      spDebited: number;
      bcCreditedMinor: number;
      ratePesosPerPoint: number;
      rateVersion: number;
      spBalanceAfter: number;
      bcBalanceAfterMinor: number;
    }
  | {
      ok: false;
      error: string;
      ratePesosPerPoint?: number;
      version?: number;
      available?: number;
    }
> {
  const { data, error } = await sb.rpc(CONVERT_SP_TO_BC_RPC, {
    p_owner_user_id: input.ownerUserId,
    p_store_id: input.storeId,
    p_points: input.points,
    p_expected_rate_version: input.expectedRateVersion,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { ok: false, error: "rpc_failed" };
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload?.error === "string" ? payload.error : "convert_failed",
      ratePesosPerPoint:
        payload?.rate_pesos_per_point == null
          ? undefined
          : Number(payload.rate_pesos_per_point),
      version: payload?.version == null ? undefined : Math.trunc(Number(payload.version)),
      available: payload?.available == null ? undefined : Math.trunc(Number(payload.available)),
    };
  }
  return {
    ok: true,
    idempotent: payload.idempotent === true,
    spDebited: Math.trunc(Number(payload.sp_debited) || input.points),
    bcCreditedMinor: Math.trunc(Number(payload.bc_credited_minor) || 0),
    ratePesosPerPoint: Number(payload.rate_pesos_per_point) || 0,
    rateVersion: Math.trunc(Number(payload.rate_version) || input.expectedRateVersion),
    spBalanceAfter: Math.trunc(Number(payload.sp_balance_after) || 0),
    bcBalanceAfterMinor: Math.trunc(Number(payload.bc_balance_after_minor) || 0),
  };
}

export async function createBusinessCashTopUpRequest(
  sb: SupabaseClient,
  input: {
    storeId: string;
    ownerUserId: string;
    amountMinor: number;
    idempotencyKey: string;
  }
): Promise<
  | { ok: true; requestId: string; status: string; idempotent?: boolean }
  | { ok: false; error: string; detail?: string }
> {
  const amount = Math.trunc(input.amountMinor);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "invalid_amount" };
  const key = String(input.idempotencyKey ?? "").trim();
  if (!key) return { ok: false, error: "idempotency_required" };

  const { data: existing } = await sb
    .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
    .select("id, status")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      requestId: String((existing as { id: string }).id),
      status: String((existing as { status?: string }).status ?? "PENDING"),
      idempotent: true,
    };
  }

  const { data, error } = await sb
    .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
    .insert({
      store_id: input.storeId,
      owner_user_id: input.ownerUserId,
      amount_minor: amount,
      status: "PENDING",
      idempotency_key: key,
    })
    .select("id, status")
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "db_error", detail: error?.message };
  }
  return {
    ok: true,
    requestId: String((data as { id: string }).id),
    status: String((data as { status?: string }).status ?? "PENDING"),
  };
}

export async function approveBusinessCashTopUpRequest(
  sb: SupabaseClient,
  input: { adminUserId: string; requestId: string }
): Promise<
  | { ok: true; idempotent: boolean; ledgerId: string | null; balanceAfterMinor: number }
  | { ok: false; error: string }
> {
  const { data, error } = await sb.rpc(APPROVE_BC_CHARGE_RPC, {
    p_admin_user_id: input.adminUserId,
    p_request_id: input.requestId,
  });
  if (error) return { ok: false, error: "rpc_failed" };
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return { ok: false, error: typeof payload?.error === "string" ? payload.error : "approve_failed" };
  }
  return {
    ok: true,
    idempotent: payload.idempotent === true,
    ledgerId: payload.ledger_id == null ? null : String(payload.ledger_id),
    balanceAfterMinor: Math.trunc(Number(payload.balance_after_minor) || 0),
  };
}

export async function rejectBusinessCashTopUpRequest(
  sb: SupabaseClient,
  input: { adminUserId: string; requestId: string; reason?: string }
): Promise<{ ok: true; idempotent: boolean } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc(REJECT_BC_CHARGE_RPC, {
    p_admin_user_id: input.adminUserId,
    p_request_id: input.requestId,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: "rpc_failed" };
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return { ok: false, error: typeof payload?.error === "string" ? payload.error : "reject_failed" };
  }
  return { ok: true, idempotent: payload.idempotent === true };
}

export type SecureCanonicalBcResult =
  | {
      ok: true;
      idempotent: boolean;
      fundingId: string;
      spendLedgerId: string;
      amountMinor: number;
      balanceAfterMinor?: number;
    }
  | { ok: false; error: string; insufficient?: InsufficientBusinessCashPayload; detail?: string };

export async function debitBusinessCashForDeliveryAd(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    storeId: string;
    applicationId: string;
    productKind: "store_sponsored" | "banner" | "partner";
    amountMinor?: number | null;
  }
): Promise<SecureCanonicalBcResult> {
  const { data, error } = await sb.rpc(BC_DELIVERY_AD_SPEND_RPC, {
    p_owner_user_id: input.ownerUserId,
    p_store_id: input.storeId,
    p_application_id: input.applicationId,
    p_product_kind: input.productKind,
    p_amount_minor: input.amountMinor ?? null,
  });
  if (error) return { ok: false, error: "rpc_failed", detail: error.message };
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    const insufficient = parseInsufficientBusinessCashRpc(payload);
    if (insufficient) {
      return { ok: false, error: "INSUFFICIENT_BUSINESS_CASH", insufficient };
    }
    return {
      ok: false,
      error: typeof payload?.error === "string" ? payload.error : "debit_failed",
      detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    };
  }
  return {
    ok: true,
    idempotent: payload.idempotent === true,
    fundingId: String(payload.funding_id ?? ""),
    spendLedgerId: String(payload.spend_ledger_id ?? ""),
    amountMinor: Math.trunc(Number(payload.amount_minor) || 0),
    balanceAfterMinor:
      payload.balance_after_minor == null
        ? undefined
        : Math.trunc(Number(payload.balance_after_minor) || 0),
  };
}

export async function refundBusinessCashForRejectedDeliveryAd(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    applicationId: string;
    productKind: "store_sponsored" | "banner" | "partner";
  }
): Promise<
  | { ok: true; idempotent: boolean; fundingId: string; refundLedgerId: string | null; amountMinor: number }
  | { ok: false; error: string; detail?: string }
> {
  const { data, error } = await sb.rpc(BC_DELIVERY_AD_REFUND_RPC, {
    p_admin_user_id: input.adminUserId,
    p_application_id: input.applicationId,
    p_product_kind: input.productKind,
  });
  if (error) return { ok: false, error: "rpc_failed", detail: error.message };
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload?.error === "string" ? payload.error : "refund_failed",
      detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    };
  }
  return {
    ok: true,
    idempotent: payload.idempotent === true,
    fundingId: String(payload.funding_id ?? ""),
    refundLedgerId:
      payload.refund_ledger_id == null ? null : String(payload.refund_ledger_id),
    amountMinor: Math.trunc(Number(payload.amount_minor) || 0),
  };
}

export async function loadCanonicalBcFundingStatusByApplicationIds(
  sb: SupabaseClient,
  input: {
    productKind: "store_sponsored" | "banner" | "partner";
    applicationIds: readonly string[];
  }
): Promise<Map<string, DeliveryAdFundingStatus>> {
  const out = new Map<string, DeliveryAdFundingStatus>();
  const ids = [
    ...new Set(input.applicationIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ];
  if (!ids.length) return out;
  try {
    const { data, error } = await sb
      .from(DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE)
      .select("application_id, status")
      .eq("product_kind", input.productKind)
      .in("application_id", ids);
    if (error) {
      if (
        /delivery_ad_canonical_bc_fundings|schema cache|does not exist/i.test(
          String(error.message)
        )
      ) {
        return out;
      }
      console.error("[loadCanonicalBcFundingStatusByApplicationIds]", error.message);
      return out;
    }
    for (const row of (data ?? []) as Array<{ application_id?: string; status?: string }>) {
      const id = String(row.application_id ?? "").trim();
      if (!id) continue;
      out.set(id, resolveFundingStatusFromCanonicalBc(row.status));
    }
  } catch (e) {
    console.error(
      "[loadCanonicalBcFundingStatusByApplicationIds]",
      e instanceof Error ? e.message : e
    );
  }
  return out;
}

export async function hasCanonicalBcFundingSecured(
  sb: SupabaseClient,
  input: {
    productKind: "store_sponsored" | "banner" | "partner";
    applicationId: string;
    storeId?: string;
  }
): Promise<boolean> {
  const id = String(input.applicationId ?? "").trim();
  if (!id) return false;
  let q = sb
    .from(DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE)
    .select("id, store_id, status")
    .eq("product_kind", input.productKind)
    .eq("application_id", id)
    .eq("status", "SECURED")
    .maybeSingle();
  const { data, error } = await q;
  if (error || !data) return false;
  if (input.storeId && String((data as { store_id?: string }).store_id) !== input.storeId) {
    return false;
  }
  return true;
}

export async function listBusinessCashLedgerForStore(
  sb: SupabaseClient,
  storeId: string,
  limit = 40
): Promise<
  Array<{
    id: string;
    entryKind: string;
    direction: string;
    amountMinor: number;
    balanceAfterMinor: number;
    createdAt: string;
  }>
> {
  const { data, error } = await sb
    .from(BUSINESS_CASH_LEDGER_TABLE)
    .select("id, entry_kind, direction, amount_minor, balance_after_minor, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    entryKind: String(row.entry_kind ?? ""),
    direction: String(row.direction ?? ""),
    amountMinor: Math.trunc(Number(row.amount_minor) || 0),
    balanceAfterMinor: Math.trunc(Number(row.balance_after_minor) || 0),
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function listEconomicPointLedgerForStore(
  sb: SupabaseClient,
  storeId: string,
  limit = 40
): Promise<
  Array<{
    id: string;
    entryKind: string;
    amount: number;
    balanceAfter: number;
    createdAt: string;
  }>
> {
  const { data, error } = await sb
    .from(STORE_ECONOMIC_POINT_LEDGER_TABLE)
    .select("id, entry_kind, amount, balance_after, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    entryKind: String(row.entry_kind ?? ""),
    amount: Math.trunc(Number(row.amount) || 0),
    balanceAfter: Math.trunc(Number(row.balance_after) || 0),
    createdAt: String(row.created_at ?? ""),
  }));
}

/**
 * AST-004 / AST-005 writers — service_role RPC only for mutations.
 */

import { canonicalCoinConversionLink, linkCoinWithdrawalRequestRows } from "@/lib/finance/coin-ledger-link";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_ADJUST_BC_RPC,
  ADMIN_ADJUST_COIN_RPC,
  APPROVE_BC_CHARGE_RPC,
  BC_CHARGE_POLICY_RPC,
  BC_DELIVERY_AD_REFUND_RPC,
  BC_DELIVERY_AD_SPEND_RPC,
  BUSINESS_CASH_ACCOUNTS_TABLE,
  BUSINESS_CASH_LEDGER_TABLE,
  CONVERT_SP_TO_BC_RPC,
  DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE,
  OWNER_CREATE_BC_CHARGE_RPC,
  REJECT_BC_CHARGE_RPC,
  STORE_ECONOMIC_POINT_ACCOUNTS_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
  parseBusinessCashChargePolicy,
  parseInsufficientBusinessCashRpc,
  resolveFundingStatusFromCanonicalBc,
  type BusinessCashChargePolicy,
  type BusinessCashConversionQuote,
  type InsufficientBusinessCashPayload,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import type { DeliveryAdFundingStatus } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";

/**
 * P0-1 — balance read. `null` = 조회 실패 (0 과 구분, 0 으로 대체 금지).
 * 계정 행이 아직 없으면 실제 잔액 0.
 */
export async function loadStoreBusinessCashBalance(
  sb: SupabaseClient,
  storeId: string
): Promise<{ balanceMinor: number | null; currency: "PHP" }> {
  const sid = String(storeId ?? "").trim();
  if (!sid) return { balanceMinor: null, currency: "PHP" };
  const { data, error } = await sb
    .from(BUSINESS_CASH_ACCOUNTS_TABLE)
    .select("balance_minor")
    .eq("store_id", sid)
    .maybeSingle();
  if (error) {
    console.error("[loadStoreBusinessCashBalance]", error.message);
    return { balanceMinor: null, currency: "PHP" };
  }
  return {
    balanceMinor: Math.trunc(Number((data as { balance_minor?: number } | null)?.balance_minor) || 0),
    currency: "PHP",
  };
}

/** P0-1 — Coin balance read. `null` = 조회 실패. 음수(환불 빚)는 그대로 둔다. */
export async function loadStoreEconomicPointsBalance(
  sb: SupabaseClient,
  storeId: string
): Promise<{ balance: number | null }> {
  const sid = String(storeId ?? "").trim();
  if (!sid) return { balance: null };
  const { data, error } = await sb
    .from(STORE_ECONOMIC_POINT_ACCOUNTS_TABLE)
    .select("balance")
    .eq("store_id", sid)
    .maybeSingle();
  if (error) {
    console.error("[loadStoreEconomicPointsBalance]", error.message);
    return { balance: null };
  }
  return { balance: Math.trunc(Number((data as { balance?: number } | null)?.balance) || 0) };
}

export const PREVIEW_COIN_CONVERSION_RPC = "preview_store_coin_conversion" as const;

function intOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * P0-5 / DB-2 — 사장님 전환 미리보기. 서버 RPC 하나가 정책·한도·잔액·미납 정산을 같은 규칙으로 계산한다.
 * 실패(정책 없음·권한·RPC 오류)는 null 이 아니라 error 로 돌려 화면이 「확인 불가」로 전환을 막게 한다.
 */
export async function buildOwnerConversionDisclosure(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    storeId: string;
    requestedPoints: number;
    previousRateVersion?: number | null;
  }
): Promise<{ ok: true; quote: BusinessCashConversionQuote } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc(PREVIEW_COIN_CONVERSION_RPC, {
    p_owner_user_id: input.ownerUserId,
    p_store_id: input.storeId,
    p_points: Math.max(0, Math.trunc(Number(input.requestedPoints) || 0)),
  });
  if (error) {
    console.error("[buildOwnerConversionDisclosure]", error.message);
    return { ok: false, error: "quote_unavailable" };
  }
  const p = (data ?? null) as Record<string, unknown> | null;
  if (!p || p.ok !== true) {
    return { ok: false, error: typeof p?.error === "string" ? p.error : "quote_unavailable" };
  }
  const rate = Number(p.rate_pesos_per_point);
  const version = Math.trunc(Number(p.version) || 0);
  if (!Number.isFinite(rate) || rate <= 0 || version < 1) return { ok: false, error: "rate_missing" };
  const limits = (p.limits ?? {}) as Record<string, unknown>;
  const usage = (p.usage ?? {}) as Record<string, unknown>;
  const prev = input.previousRateVersion;
  return {
    ok: true,
    quote: {
      ratePesosPerPoint: rate,
      version,
      isDefaultRate: p.is_default_rate === true,
      effectiveFrom: p.effective_from == null ? null : String(p.effective_from),
      rateChangedNoticeRequired: prev != null && Number.isFinite(prev) && prev !== version,
      minimumCoin: Math.max(1, Math.trunc(Number(p.minimum_coin) || 1)),
      conversionUnit: Math.max(1, Math.trunc(Number(p.conversion_unit) || 1)),
      conversionEnabled: p.conversion_enabled !== false,
      limits: {
        maximumConversionsPerDay: intOrNull(limits.maximum_conversions_per_day),
        maximumConversionsPerWeek: intOrNull(limits.maximum_conversions_per_week),
        maximumConversionsPerMonth: intOrNull(limits.maximum_conversions_per_month),
        dailyLimitCoin: intOrNull(limits.daily_limit_coin),
        monthlyLimitCoin: intOrNull(limits.monthly_limit_coin),
        minimumIntervalHours: intOrNull(limits.minimum_interval_hours),
      },
      usage: {
        dayCount: Math.trunc(Number(usage.day_count) || 0),
        dayCoin: Math.trunc(Number(usage.day_coin) || 0),
        weekCount: Math.trunc(Number(usage.week_count) || 0),
        monthCount: Math.trunc(Number(usage.month_count) || 0),
        monthCoin: Math.trunc(Number(usage.month_coin) || 0),
      },
      canConvert: p.can_convert === true,
      blockers: Array.isArray(p.blockers) ? (p.blockers as BusinessCashConversionQuote["blockers"]) : [],
      requestedPoints: Math.trunc(Number(p.requested_points) || 0),
      maxConvertible: Math.max(0, Math.trunc(Number(p.max_convertible) || 0)),
      storePointsBalance: Math.trunc(Number(p.coin_before) || 0),
      businessCashBalanceMinor: Math.trunc(Number(p.cash_before_minor) || 0),
      outstandingFeeMinor: Math.trunc(Number(p.outstanding_fee_minor) || 0),
      coinAfter: intOrNull(p.coin_after),
      expectedBusinessCashMinor: intOrNull(p.cash_credit_minor),
      feeSettleMinor: intOrNull(p.fee_settle_minor),
      cashAfterMinor: intOrNull(p.cash_after_minor),
      cashNetIncreaseMinor: intOrNull(p.cash_net_increase_minor),
    },
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
      minimumCoin?: number;
      conversionUnit?: number;
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
      minimumCoin: payload?.minimum_coin == null ? undefined : Math.trunc(Number(payload.minimum_coin)),
      conversionUnit: payload?.conversion_unit == null ? undefined : Math.trunc(Number(payload.conversion_unit)),
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

/** FIN-04 / D-4 — top-up policy (caps · deposit methods · receiving note). Missing RPC → DB defaults. */
export async function loadBusinessCashChargePolicy(sb: SupabaseClient): Promise<BusinessCashChargePolicy> {
  const { data, error } = await sb.rpc(BC_CHARGE_POLICY_RPC);
  if (error) {
    console.error("[loadBusinessCashChargePolicy]", error.message);
    return parseBusinessCashChargePolicy(null);
  }
  return parseBusinessCashChargePolicy(data);
}

/**
 * FIN-04 — owner Cash top-up request via `owner_create_business_cash_charge_request` (DB checks ownership,
 * one PENDING per store, deposit reference unique per store, caps, idempotency). No direct table write.
 */
export async function createBusinessCashTopUpRequest(
  sb: SupabaseClient,
  input: {
    storeId: string;
    ownerUserId: string;
    amountMinor: number;
    paymentMethod: string;
    paymentReference: string;
    proofFilePath?: string | null;
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
  const method = String(input.paymentMethod ?? "").trim().toLowerCase();
  if (!method) return { ok: false, error: "payment_method_required" };
  const reference = String(input.paymentReference ?? "").trim();
  if (!reference) return { ok: false, error: "payment_reference_required" };
  const proof = String(input.proofFilePath ?? "").trim();

  const { data, error } = await sb.rpc(OWNER_CREATE_BC_CHARGE_RPC, {
    p_owner_user_id: input.ownerUserId,
    p_store_id: input.storeId,
    p_amount_minor: amount,
    p_payment_method: method,
    p_payment_reference: reference,
    p_proof_file_path: proof || null,
    p_idempotency_key: key,
  });
  if (error) return { ok: false, error: "rpc_failed", detail: error.message };
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return { ok: false, error: typeof payload?.error === "string" ? payload.error : "topup_request_failed" };
  }
  return {
    ok: true,
    requestId: String(payload.request_id ?? ""),
    status: String(payload.status ?? "PENDING"),
    idempotent: payload.idempotent === true,
  };
}

export async function approveBusinessCashTopUpRequest(
  sb: SupabaseClient,
  input: { adminUserId: string; requestId: string; reason: string }
): Promise<
  | { ok: true; idempotent: boolean; ledgerId: string | null; balanceAfterMinor: number }
  | { ok: false; error: string }
> {
  const { data, error } = await sb.rpc(APPROVE_BC_CHARGE_RPC, {
    p_admin_user_id: input.adminUserId,
    p_request_id: input.requestId,
    p_reason: input.reason,
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

export type AdminBalanceCorrectionInput = {
  adminUserId: string;
  storeId: string;
  asset: "cash" | "coin";
  direction: "credit" | "debit";
  /** Cash: PHP minor units · Coin: whole Coin. */
  amount: number;
  reason: string;
  evidenceRef: string;
  idempotencyKey: string;
  /** Record the correction row only (balance unchanged). */
  ledgerOnly: boolean;
};

/** FIN-08 — super_admin correction (DB re-checks super_admin, writes ledger ADMIN_ADJUST + audit_logs). */
export async function adminAdjustStoreBalance(
  sb: SupabaseClient,
  input: AdminBalanceCorrectionInput
): Promise<
  | {
      ok: true;
      idempotent: boolean;
      ledgerId: string | null;
      balanceBefore: number | null;
      balanceAfter: number;
    }
  | { ok: false; error: string }
> {
  const isCash = input.asset === "cash";
  const { data, error } = await sb.rpc(isCash ? ADMIN_ADJUST_BC_RPC : ADMIN_ADJUST_COIN_RPC, {
    p_admin_user_id: input.adminUserId,
    p_store_id: input.storeId,
    p_direction: input.direction,
    ...(isCash ? { p_amount_minor: Math.trunc(input.amount) } : { p_amount: Math.trunc(input.amount) }),
    p_reason: input.reason,
    p_evidence_ref: input.evidenceRef,
    p_idempotency_key: input.idempotencyKey,
    p_ledger_only: input.ledgerOnly,
  });
  if (error) return { ok: false, error: "rpc_failed" };
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return { ok: false, error: typeof payload?.error === "string" ? payload.error : "adjust_failed" };
  }
  const before = isCash ? payload.balance_before_minor : payload.balance_before;
  const after = isCash ? payload.balance_after_minor : payload.balance_after;
  return {
    ok: true,
    idempotent: payload.idempotent === true,
    ledgerId: payload.ledger_id == null ? null : String(payload.ledger_id),
    balanceBefore: before == null ? null : Math.trunc(Number(before) || 0),
    balanceAfter: Math.trunc(Number(after) || 0),
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
    productKind: "store_sponsored" | "banner" | "partner" | "platform_popup";
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

/** V3-04 DEF-7 — 사장님 제출 = 비즈캐시 차감 + 상태 전이 단일 트랜잭션 RPC. */
export const OWNER_SUBMIT_DELIVERY_AD_WITH_BC_RPC =
  "owner_submit_delivery_ad_with_business_cash" as const;

export type SecureCanonicalBcFailure = Extract<SecureCanonicalBcResult, { ok: false }>;

export type OwnerSubmitDeliveryAdWithBcResult =
  /** 함수 미배포 DB — 호출자는 제출을 거절한다 (2단계 차감 → 전이 폴백 없음, V3-04). */
  | { status: "rpc_missing" }
  | { status: "rpc_error"; message: string }
  /** 차감 실패 — 아무것도 쓰지 않음. */
  | { status: "cash_failed"; cash: SecureCanonicalBcFailure }
  /** 전이 실패 — 차감까지 DB 에서 롤백됨. error = owner_delivery_ad_transition 원본 코드. */
  | { status: "transition_failed"; error: string | undefined }
  | { status: "ok"; auditId: string | null };

/** 사장님 전이 writer 의 추가 실패 결과 (submit/resubmit + secureBusinessCash 옵션일 때만). */
export type OwnerDeliveryAdSubmitCashOutcome =
  | { ok: false; error: "business_cash_failed"; cash: SecureCanonicalBcFailure }
  /** 원자 함수 미배포 — 라우트가 503 으로 거절한다 (2단계 폴백 없음, V3-04). */
  | { ok: false; error: "atomic_submit_rpc_missing" };

function isMissingRpcError(err: { code?: string | null; message?: string | null }): boolean {
  return (
    err.code === "PGRST202" ||
    err.code === "42883" ||
    /could not find the function/i.test(String(err.message ?? ""))
  );
}

/**
 * DEF-7: submit/resubmit 의 캐시 차감(business_cash_delivery_ad_spend)과
 * 상태 전이(owner_delivery_ad_transition)를 DB 함수 하나로 — 전이 실패 시 차감도 남지 않는다.
 */
export async function ownerSubmitDeliveryAdWithBusinessCash(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    storeId: string;
    productKind: "store_sponsored" | "banner";
    campaignId: string;
    action: "submit" | "resubmit";
    expectedLifecycle: string;
    auditAction: string;
  }
): Promise<OwnerSubmitDeliveryAdWithBcResult> {
  const { data, error } = await sb.rpc(OWNER_SUBMIT_DELIVERY_AD_WITH_BC_RPC, {
    p_owner_user_id: input.ownerUserId,
    p_store_id: input.storeId,
    p_product_kind: input.productKind,
    p_campaign_id: input.campaignId,
    p_action: input.action,
    p_expected_lifecycle: input.expectedLifecycle,
    p_audit_action: input.auditAction,
  });
  if (error) {
    if (isMissingRpcError(error)) return { status: "rpc_missing" };
    return { status: "rpc_error", message: error.message };
  }
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    if (payload?.stage === "cash") {
      const cash = (payload.cash ?? null) as Record<string, unknown> | null;
      const insufficient = parseInsufficientBusinessCashRpc(cash);
      return {
        status: "cash_failed",
        cash: insufficient
          ? { ok: false, error: "INSUFFICIENT_BUSINESS_CASH", insufficient }
          : {
              ok: false,
              error: typeof cash?.error === "string" ? cash.error : "debit_failed",
              detail: typeof cash?.detail === "string" ? cash.detail : undefined,
            },
      };
    }
    return {
      status: "transition_failed",
      error: typeof payload?.error === "string" ? payload.error : undefined,
    };
  }
  return {
    status: "ok",
    auditId: typeof payload.audit_id === "string" ? payload.audit_id : null,
  };
}

export async function refundBusinessCashForRejectedDeliveryAd(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    applicationId: string;
    productKind: "store_sponsored" | "banner" | "partner" | "platform_popup";
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
  const { data, error } = await sb
    .from(DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE)
    .select("id, store_id, status")
    .eq("product_kind", input.productKind)
    .eq("application_id", id)
    .eq("status", "SECURED")
    .maybeSingle();
  if (error || !data) return false;
  if (input.storeId && String((data as { store_id?: string }).store_id) !== input.storeId) {
    return false;
  }
  return true;
}

/** Owner/Admin funding visibility — canonical Cash binding, never an archived store-cash record. */
export async function loadCanonicalBcFundingDetailForApplication(
  sb: SupabaseClient,
  input: {
    productKind: "store_sponsored" | "banner" | "partner";
    applicationId: string;
  }
): Promise<{
  fundingId: string;
  status: DeliveryAdFundingStatus;
  amountMinor: number;
  spendLedgerId: string | null;
  refundLedgerId: string | null;
  fundedAt: string | null;
  storeId: string;
} | null> {
  const id = String(input.applicationId ?? "").trim();
  if (!id) return null;
  const { data, error } = await sb
    .from(DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE)
    .select(
      "id, store_id, status, amount_minor, spend_ledger_id, refund_ledger_id, secured_at"
    )
    .eq("product_kind", input.productKind)
    .eq("application_id", id)
    .maybeSingle();
  if (error) {
    if (
      /delivery_ad_canonical_bc_fundings|schema cache|does not exist/i.test(String(error.message))
    ) {
      return null;
    }
    console.error("[loadCanonicalBcFundingDetailForApplication]", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as {
    id?: string;
    store_id?: string;
    status?: string;
    amount_minor?: number;
    spend_ledger_id?: string | null;
    refund_ledger_id?: string | null;
    secured_at?: string | null;
  };
  const fundingId = String(row.id ?? "").trim();
  const storeId = String(row.store_id ?? "").trim();
  if (!fundingId || !storeId) return null;
  return {
    fundingId,
    status: resolveFundingStatusFromCanonicalBc(row.status),
    amountMinor: Math.trunc(Number(row.amount_minor) || 0),
    spendLedgerId: row.spend_ledger_id == null ? null : String(row.spend_ledger_id),
    refundLedgerId: row.refund_ledger_id == null ? null : String(row.refund_ledger_id),
    fundedAt: row.secured_at == null ? null : String(row.secured_at),
    storeId,
  };
}

/** 관리자 감사용 원장 필드 (처리 주체·멱등 키). 사장님 응답에는 넣지 않는다. */
export type LedgerAuditFields = {
  actorType: string;
  actorUserId: string | null;
  idempotencyKey: string;
};

export async function listBusinessCashLedgerForStore(
  sb: SupabaseClient,
  storeId: string,
  limit = 40,
  opts?: { includeAudit?: boolean }
): Promise<
  Array<{
    id: string;
    entryKind: string;
    direction: string;
    amountMinor: number;
    balanceAfterMinor: number;
    relatedType: string;
    relatedId: string;
    createdAt: string;
  } & Partial<LedgerAuditFields>>
> {
  const audit = opts?.includeAudit === true;
  const { data, error } = await sb
    .from(BUSINESS_CASH_LEDGER_TABLE)
    .select(cashLedgerCols(audit))
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error || !data) return [];
  return (data as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    entryKind: String(row.entry_kind ?? ""),
    direction: String(row.direction ?? ""),
    amountMinor: Math.trunc(Number(row.amount_minor) || 0),
    balanceAfterMinor: Math.trunc(Number(row.balance_after_minor) || 0),
    relatedType: String(row.related_type ?? ""),
    relatedId: String(row.related_id ?? ""),
    createdAt: String(row.created_at ?? ""),
    ...(audit ? auditFields(row) : {}),
  }));
}

const LEDGER_AUDIT_COLS = ", actor_type, actor_user_id, idempotency_key";
/** 문자열 타입으로 고정 — Supabase 선택 파서가 조건부 열을 해석하지 못해 타입이 깨지는 것을 막는다. */
function cashLedgerCols(audit: boolean): string {
  return "id, entry_kind, direction, amount_minor, balance_after_minor, related_type, related_id, created_at" + (audit ? LEDGER_AUDIT_COLS : "");
}
function coinLedgerCols(audit: boolean): string {
  return "id, entry_kind, amount, balance_after, related_type, related_id, created_at" + (audit ? LEDGER_AUDIT_COLS : "");
}

function auditFields(row: Record<string, unknown>): LedgerAuditFields {
  return {
    actorType: String(row.actor_type ?? "system"),
    actorUserId: row.actor_user_id == null ? null : String(row.actor_user_id),
    idempotencyKey: String(row.idempotency_key ?? ""),
  };
}

export async function listEconomicPointLedgerForStore(
  sb: SupabaseClient,
  storeId: string,
  limit = 40,
  opts?: { includeAudit?: boolean }
): Promise<
  Array<{
    id: string;
    entryKind: string;
    amount: number;
    balanceAfter: number;
    relatedType: string;
    relatedId: string;
    createdAt: string;
  } & Partial<LedgerAuditFields>>
> {
  const audit = opts?.includeAudit === true;
  const { data, error } = await sb
    .from(STORE_ECONOMIC_POINT_LEDGER_TABLE)
    .select(coinLedgerCols(audit))
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error || !data) return [];
  const rows = (data as unknown as Array<Record<string, unknown>>).map((row) =>
    canonicalCoinConversionLink({
      id: String(row.id ?? ""),
      entryKind: String(row.entry_kind ?? ""),
      amount: Math.trunc(Number(row.amount) || 0),
      balanceAfter: Math.trunc(Number(row.balance_after) || 0),
      relatedType: String(row.related_type ?? ""),
      relatedId: String(row.related_id ?? ""),
      createdAt: String(row.created_at ?? ""),
      ...(audit ? auditFields(row) : {}),
    })
  );
  // 관리자·사장님 같은 연결 번호 (lib/finance/coin-ledger-link)
  await linkCoinWithdrawalRequestRows(sb, rows);
  return rows;
}

/**
 * Cash sale fee + outstanding obligation writers (CUT D).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { saleFeeIdempotencyKeyForOrder, saleFeeReversalIdempotencyKeyForOrder } from "@/lib/stores/confirmed-sale-revenue";
import { calculateOrderCommission } from "@/lib/stores/store-fee-policy-resolve";

export const CHARGE_SALE_FEE_FOR_ORDER_RPC = "charge_sale_fee_for_order" as const;
export const SETTLE_SALE_FEE_OBLIGATIONS_RPC = "settle_store_sale_fee_obligations" as const;
export const REVERSE_SALE_FEE_FOR_ORDER_RPC = "reverse_sale_fee_for_order" as const;

export type ChargeSaleFeeResult =
  | {
      ok: true;
      idempotent?: boolean;
      feeDueMinor?: number;
      feePaidMinor?: number;
      feeOutstandingMinor?: number;
    }
  | { ok: false; error: string };

export async function chargeSaleFeeForOrder(
  sb: SupabaseClient,
  input: {
    storeId: string;
    orderId: string;
    settlementId?: string | null;
    confirmedRevenuePhp: number;
    feePercent: number;
    fixedFeePhp: number;
    deliveryFeeAmount?: number;
    deliveryFeeMode?: string | null;
    deliveryFeePercent?: number | string | null;
    idempotencyKey?: string;
  }
): Promise<ChargeSaleFeeResult> {
  const storeId = input.storeId.trim();
  const orderId = input.orderId.trim();
  const confirmed = Math.max(0, Math.trunc(input.confirmedRevenuePhp));
  if (!storeId || !orderId || confirmed <= 0) return { ok: false, error: "invalid_input" };

  const deliveryFeeAmount = Math.max(0, Math.trunc(input.deliveryFeeAmount ?? 0));
  const feeCalc = calculateOrderCommission({
    commissionBaseAmount: confirmed,
    deliveryFeeAmount,
    feePercent: input.feePercent,
    fixedFee: input.fixedFeePhp,
    deliveryFeeMode: input.deliveryFeeMode ?? "none",
    deliveryFeePercent: input.deliveryFeePercent ?? 0,
  });
  const feeDuePhp = feeCalc.totalPlatformFeeAmount + feeCalc.deliveryIncomeAmount;

  const { data, error } = await sb.rpc(CHARGE_SALE_FEE_FOR_ORDER_RPC, {
    p_store_id: storeId,
    p_order_id: orderId,
    p_settlement_id: input.settlementId?.trim() || null,
    p_confirmed_revenue_php: confirmed,
    p_fee_due_php: feeDuePhp,
    p_idempotency_key: input.idempotencyKey?.trim() || saleFeeIdempotencyKeyForOrder(orderId),
  });

  if (error) {
    if (/does not exist|Could not find the function/i.test(error.message)) {
      return { ok: false, error: "rpc_missing" };
    }
    return { ok: false, error: error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "charge_failed") };

  return {
    ok: true,
    idempotent: row.idempotent === true,
    feeDueMinor: Number(row.fee_due_minor) || 0,
    feePaidMinor: Number(row.fee_paid_minor) || 0,
    feeOutstandingMinor: Number(row.fee_outstanding_minor) || 0,
  };
}

export async function settleSaleFeeObligationsOnCashInflow(
  sb: SupabaseClient,
  storeId: string
): Promise<{ ok: boolean; settledCount?: number; error?: string }> {
  const sid = storeId.trim();
  if (!sid) return { ok: false, error: "invalid_input" };

  const { data, error } = await sb.rpc(SETTLE_SALE_FEE_OBLIGATIONS_RPC, {
    p_store_id: sid,
  });

  if (error) {
    if (/does not exist|Could not find the function/i.test(error.message)) {
      return { ok: false, error: "rpc_missing" };
    }
    return { ok: false, error: error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "settle_failed") };

  return { ok: true, settledCount: Number(row.settled_count) || 0 };
}

export type ReverseSaleFeeResult =
  | {
      ok: true;
      idempotent?: boolean;
      skipped?: boolean;
      cashCreditedMinor?: number;
      outstandingCancelledMinor?: number;
    }
  | { ok: false; error: string };

export async function reverseSaleFeeForOrder(
  sb: SupabaseClient,
  orderId: string,
  idempotencyKey?: string
): Promise<ReverseSaleFeeResult> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "invalid_input" };

  const { data, error } = await sb.rpc(REVERSE_SALE_FEE_FOR_ORDER_RPC, {
    p_order_id: oid,
    p_idempotency_key: idempotencyKey?.trim() || saleFeeReversalIdempotencyKeyForOrder(oid),
  });

  if (error) {
    if (/does not exist|Could not find the function/i.test(error.message)) {
      return { ok: false, error: "rpc_missing" };
    }
    return { ok: false, error: error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "reverse_failed") };

  return {
    ok: true,
    idempotent: row.idempotent === true,
    skipped: row.skipped === true,
    cashCreditedMinor: Number(row.cash_credited_minor) || 0,
    outstandingCancelledMinor: Number(row.outstanding_cancelled_minor) || 0,
  };
}

/** PHP whole pesos → canonical Cash minor units (centavos). */
export function phpMajorToCashMinor(php: number): number {
  return Math.max(0, Math.trunc(php)) * 100;
}

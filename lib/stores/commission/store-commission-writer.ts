/**
 * Store commission writers — the ONLY TS entry points that move commission money.
 * Contract: lib/stores/commission/store-commission-contract.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { saleFeeIdempotencyKeyForOrder } from "@/lib/stores/confirmed-sale-revenue";
import {
  buildAppliedFeePolicySnapshot,
  calculateOrderCommission,
  isMissingStoreFeePolicy,
  resolveEffectiveStoreFeePolicy,
  type EffectiveStoreFeePolicy,
} from "@/lib/stores/store-fee-policy-resolve";
import {
  computeStoreCashPosition,
  normalizeStoreCashOrderGateMode,
  STORE_CASH_ORDER_GATE_SETTING_KEY,
  STORE_COMMISSION_RPC,
  type StoreCashOrderGateMode,
  type StoreCashPosition,
  type StoreCommissionAdjustmentDecision,
  type StoreCommissionChargeStage,
} from "@/lib/stores/commission/store-commission-contract";

function isMissingRpc(message: string | undefined): boolean {
  return /does not exist|Could not find the function|schema cache/i.test(String(message ?? ""));
}

function money(n: unknown): number {
  const v = Math.trunc(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export type StoreCommissionQuote = {
  storeId: string;
  orderId: string;
  /** payment + gift redemption + platform-funded coupon (PHP). Store-funded coupon is not revenue. */
  commissionBasePhp: number;
  feeDuePhp: number;
  snapshot: Record<string, unknown>;
};

/**
 * Commission base and fee for an order — frozen at charge time.
 * Policy precedence follows `resolveEffectiveStoreFeePolicy`; a legacy settlement snapshot wins
 * so an order that already has a settlement row is charged with the same numbers.
 */
export async function quoteStoreCommissionForOrder(
  sb: SupabaseClient,
  orderId: string
): Promise<{ ok: true; quote: StoreCommissionQuote } | { ok: false; error: string }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id" };

  const { data: order, error } = await sb
    .from("store_orders")
    .select("id, store_id, payment_amount, gift_redemption_amount, platform_funded_amount, delivery_fee_amount")
    .eq("id", oid)
    .maybeSingle();
  if (error || !order) return { ok: false, error: "order_not_found" };

  const storeId = String(order.store_id ?? "").trim();
  if (!storeId) return { ok: false, error: "missing_store_id" };

  const commissionBasePhp =
    money(order.payment_amount) + money(order.gift_redemption_amount) + money(order.platform_funded_amount);
  const deliveryFeeAmount = money(order.delivery_fee_amount);

  const { data: settlement } = await sb
    .from("store_settlements")
    .select("applied_fee_policy_id, applied_fee_policy_snapshot")
    .eq("order_id", oid)
    .maybeSingle();
  const legacySnap = settlement?.applied_fee_policy_snapshot as Record<string, unknown> | null | undefined;

  let policyId: string | null;
  let policySnapshot: Record<string, unknown>;
  let feePercent: number;
  let fixedFee: number;
  let deliveryFeeMode: string;
  let deliveryFeePercent: number;
  if (legacySnap && typeof legacySnap === "object") {
    policyId = settlement?.applied_fee_policy_id ? String(settlement.applied_fee_policy_id) : null;
    policySnapshot = legacySnap;
    feePercent = Number(legacySnap.fee_percent ?? 0) || 0;
    fixedFee = money(legacySnap.fixed_fee);
    deliveryFeeMode = String(legacySnap.delivery_fee_mode ?? "none");
    deliveryFeePercent = Number(legacySnap.delivery_fee_percent ?? 0) || 0;
  } else {
    const policy = await resolveEffectiveStoreFeePolicy(sb, { storeId });
    if (isMissingStoreFeePolicy(policy)) return { ok: false, error: "missing_fee_policy" };
    policyId = policy.policyId;
    policySnapshot = buildAppliedFeePolicySnapshot(policy);
    feePercent = policy.feePercent;
    fixedFee = policy.fixedFee;
    deliveryFeeMode = policy.deliveryFeeMode;
    deliveryFeePercent = policy.deliveryFeePercent;
  }

  const calc = calculateOrderCommission({
    commissionBaseAmount: commissionBasePhp,
    deliveryFeeAmount,
    feePercent,
    fixedFee,
    deliveryFeeMode,
    deliveryFeePercent,
  });
  const feeDuePhp = calc.totalPlatformFeeAmount + calc.deliveryIncomeAmount;

  return {
    ok: true,
    quote: {
      storeId,
      orderId: oid,
      commissionBasePhp,
      feeDuePhp,
      snapshot: {
        policy_id: policyId,
        policy: policySnapshot,
        commission_base_php: calc.commissionBaseAmount,
        delivery_fee_php: deliveryFeeAmount,
        fee_percent: calc.platformFeePercent,
        platform_fee_php: calc.platformFeeAmount,
        fixed_fee_php: calc.fixedFeeAmount,
        delivery_income_php: calc.deliveryIncomeAmount,
        fee_due_php: feeDuePhp,
      },
    },
  };
}

/**
 * Policy frozen on the order's commission row (charged at 조리 시작), or null when the order
 * has no commission row yet. Shape matches `resolveEffectiveStoreFeePolicy`.
 */
export async function loadFrozenCommissionPolicyForOrder(
  sb: SupabaseClient,
  orderId: string
): Promise<EffectiveStoreFeePolicy | null> {
  const { data } = await sb
    .from("store_sale_fee_obligations")
    .select("fee_snapshot")
    .eq("order_id", orderId.trim())
    .maybeSingle();
  const snap = (data?.fee_snapshot ?? null) as Record<string, unknown> | null;
  const policy = (snap?.policy ?? null) as Record<string, unknown> | null;
  if (!snap || !policy || typeof policy !== "object") return null;
  const scope = String(policy.scope ?? "default");
  return {
    policyId: snap.policy_id ? String(snap.policy_id) : null,
    policyName: String(policy.policy_name ?? ""),
    feePercent: Number(policy.fee_percent ?? 0) || 0,
    fixedFee: money(policy.fixed_fee),
    deliveryFeeMode: String(policy.delivery_fee_mode ?? "none"),
    deliveryFeePercent: Number(policy.delivery_fee_percent ?? 0) || 0,
    scope: (["store", "topic", "category", "default"].includes(scope) ? scope : "default") as EffectiveStoreFeePolicy["scope"],
    snapshot: (policy.raw ?? {}) as Record<string, unknown>,
  };
}

export type ChargeStoreCommissionResult =
  | {
      ok: true;
      skipped?: boolean;
      idempotent?: boolean;
      feeDueMinor?: number;
      feePaidMinor?: number;
      feeOutstandingMinor?: number;
    }
  | { ok: false; error: string };

/**
 * Charge the order's commission from Business Cash. Idempotent per order
 * (`sale_fee:order:{id}`): calling at `preparing` and again at `completed` charges once.
 */
export async function chargeStoreCommissionForOrder(
  sb: SupabaseClient,
  orderId: string,
  stage: StoreCommissionChargeStage
): Promise<ChargeStoreCommissionResult> {
  const q = await quoteStoreCommissionForOrder(sb, orderId);
  if (!q.ok) return q;
  const { quote } = q;
  if (quote.commissionBasePhp <= 0 || quote.feeDuePhp <= 0) return { ok: true, skipped: true };

  const { data, error } = await sb.rpc(STORE_COMMISSION_RPC.charge, {
    p_store_id: quote.storeId,
    p_order_id: quote.orderId,
    p_charge_stage: stage,
    p_commission_base_php: quote.commissionBasePhp,
    p_fee_due_php: quote.feeDuePhp,
    p_fee_snapshot: quote.snapshot,
    p_idempotency_key: saleFeeIdempotencyKeyForOrder(quote.orderId),
  });
  if (error) {
    if (isMissingRpc(error.message)) return { ok: false, error: "rpc_missing" };
    return { ok: false, error: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "charge_failed") };
  return {
    ok: true,
    skipped: row.skipped === true,
    idempotent: row.idempotent === true,
    feeDueMinor: Number(row.fee_due_minor) || 0,
    feePaidMinor: Number(row.fee_paid_minor) || 0,
    feeOutstandingMinor: Number(row.fee_outstanding_minor) || 0,
  };
}

/** Cancel / refund after charge → manual review queue. Never moves money. */
export async function flagStoreCommissionReview(
  sb: SupabaseClient,
  orderId: string,
  trigger: "cancelled" | "refunded"
): Promise<{ ok: true; flagged: boolean } | { ok: false; error: string }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id" };
  const { data, error } = await sb.rpc(STORE_COMMISSION_RPC.flagReview, {
    p_order_id: oid,
    p_trigger: trigger,
  });
  if (error) {
    if (isMissingRpc(error.message)) return { ok: false, error: "rpc_missing" };
    return { ok: false, error: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "flag_failed") };
  return { ok: true, flagged: row.skipped !== true };
}

export type ResolveStoreCommissionAdjustmentResult =
  | { ok: true; cashRefundedMinor: number; outstandingCancelledMinor: number }
  | { ok: false; error: string };

/** Admin decision on a `review_required` commission — the only fee refund path. */
export async function resolveStoreCommissionAdjustment(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    orderId: string;
    decision: StoreCommissionAdjustmentDecision;
    note: string;
  }
): Promise<ResolveStoreCommissionAdjustmentResult> {
  const { data, error } = await sb.rpc(STORE_COMMISSION_RPC.resolveAdjustment, {
    p_admin_user_id: input.adminUserId,
    p_order_id: input.orderId.trim(),
    p_decision: input.decision,
    p_note: input.note,
  });
  if (error) {
    if (isMissingRpc(error.message)) return { ok: false, error: "rpc_missing" };
    return { ok: false, error: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "resolve_failed") };
  return {
    ok: true,
    cashRefundedMinor: Number(row.cash_refunded_minor) || 0,
    outstandingCancelledMinor: Number(row.outstanding_cancelled_minor) || 0,
  };
}

export async function loadStoreCashOrderGateMode(sb: SupabaseClient): Promise<StoreCashOrderGateMode> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STORE_CASH_ORDER_GATE_SETTING_KEY)
    .maybeSingle();
  if (error || !data) return "off";
  return normalizeStoreCashOrderGateMode((data.value_json as { value?: unknown } | null)?.value);
}

export async function saveStoreCashOrderGateMode(
  sb: SupabaseClient,
  mode: StoreCashOrderGateMode
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: STORE_CASH_ORDER_GATE_SETTING_KEY,
      value_json: { value: mode },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const PAGE = 1000;

/** PostgREST caps a select at 1000 rows — totals must read every page. */
export async function selectAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  maxRows: number = Number.POSITIVE_INFINITY
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const to = Math.min(from + PAGE, maxRows) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < to - from + 1) return rows;
  }
  return rows;
}

/** Cash positions for many stores (Admin list / Owner single) — same math as the DB gate. */
export async function loadStoreCashPositions(
  sb: SupabaseClient,
  storeIds: readonly string[]
): Promise<Map<string, StoreCashPosition>> {
  const ids = [...new Set(storeIds.map((s) => s.trim()).filter(Boolean))];
  const out = new Map<string, StoreCashPosition>();
  if (!ids.length) return out;

  const [gateMode, balances, outstanding] = await Promise.all([
    loadStoreCashOrderGateMode(sb),
    selectAllPages<{ store_id: string; balance_minor: number }>((from, to) =>
      sb.from("business_cash_accounts").select("store_id, balance_minor").in("store_id", ids).range(from, to)
    ),
    selectAllPages<{ store_id: string; fee_outstanding_minor: number }>((from, to) =>
      sb
        .from("store_sale_fee_obligations")
        .select("store_id, fee_outstanding_minor")
        .in("store_id", ids)
        .eq("status", "open")
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const bal = new Map<string, number>();
  for (const r of balances) {
    bal.set(String(r.store_id), Math.trunc(Number(r.balance_minor) || 0));
  }
  const owed = new Map<string, number>();
  for (const r of outstanding) {
    const k = String(r.store_id);
    owed.set(k, (owed.get(k) ?? 0) + Math.trunc(Number(r.fee_outstanding_minor) || 0));
  }
  for (const id of ids) {
    out.set(
      id,
      computeStoreCashPosition({
        storeId: id,
        balanceMinor: bal.get(id) ?? 0,
        outstandingMinor: owed.get(id) ?? 0,
        gateMode,
      })
    );
  }
  return out;
}

export async function loadStoreCashPosition(sb: SupabaseClient, storeId: string): Promise<StoreCashPosition> {
  const map = await loadStoreCashPositions(sb, [storeId]);
  return (
    map.get(storeId.trim()) ??
    computeStoreCashPosition({ storeId, balanceMinor: 0, outstandingMinor: 0, gateMode: "off" })
  );
}

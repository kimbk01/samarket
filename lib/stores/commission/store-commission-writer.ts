/**
 * Store commission — server entry points. Money moves ONLY inside DB functions:
 *   - charge / review flag: trigger `trg_store_orders_commission_lifecycle` (status transaction)
 *   - refund decision: `admin_decide_store_commission_adjustment`
 * This module never computes or writes commission money itself.
 * Contract: lib/stores/commission/store-commission-contract.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EffectiveStoreFeePolicy } from "@/lib/stores/store-fee-policy-resolve";
import {
  computeStoreCashPosition,
  normalizeStoreCashOrderGateMode,
  STORE_CASH_ORDER_GATE_SETTING_KEY,
  STORE_COMMISSION_RPC,
  type StoreCashOrderGateMode,
  type StoreCashPosition,
  type StoreCommissionDecision,
} from "@/lib/stores/commission/store-commission-contract";

function isMissingRpc(message: string | undefined): boolean {
  return /does not exist|Could not find the function|schema cache/i.test(String(message ?? ""));
}

function money(n: unknown): number {
  const v = Math.trunc(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * Policy frozen on the order's commission row when it was charged, or null when the order has
 * no commission row. Shape matches `resolveEffectiveStoreFeePolicy` (used by the settlement
 * snapshot so it never re-resolves a different policy).
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

/** Reconcile-only: queue a legacy closed order whose live commission was never reviewed. */
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

export type DecideStoreCommissionResult =
  | {
      ok: true;
      idempotent: boolean;
      adjustmentId: string;
      decision: StoreCommissionDecision;
      approvedMinor: number;
      cashRefundMinor: number;
      outstandingCancelMinor: number;
    }
  | { ok: false; error: string; maxMinor?: number };

/** Admin decision on a `review_required` commission — the only commission refund path. */
export async function decideStoreCommissionAdjustment(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    orderId: string;
    decision: StoreCommissionDecision;
    /** null = full amount (approve). Ignored for reject. */
    approvedMinor: number | null;
    reason: string;
    idempotencyKey: string;
  }
): Promise<DecideStoreCommissionResult> {
  const { data, error } = await sb.rpc(STORE_COMMISSION_RPC.decide, {
    p_admin_user_id: input.adminUserId,
    p_order_id: input.orderId.trim(),
    p_decision: input.decision,
    p_approved_minor: input.decision === "approve" ? input.approvedMinor : null,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    if (isMissingRpc(error.message)) return { ok: false, error: "rpc_missing" };
    return { ok: false, error: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return {
      ok: false,
      error: String(row.error ?? "decide_failed"),
      maxMinor: row.max_minor != null ? Number(row.max_minor) : undefined,
    };
  }
  return {
    ok: true,
    idempotent: row.idempotent === true,
    adjustmentId: String(row.adjustment_id ?? ""),
    decision: row.decision === "reject" ? "reject" : "approve",
    approvedMinor: Number(row.approved_minor) || 0,
    cashRefundMinor: Number(row.cash_refund_minor) || 0,
    outstandingCancelMinor: Number(row.outstanding_cancel_minor) || 0,
  };
}

export type StoreCashOrderGateSetting = {
  mode: StoreCashOrderGateMode;
  reason: string | null;
  changedBy: string | null;
  changedAt: string | null;
};

export async function loadStoreCashOrderGateSetting(sb: SupabaseClient): Promise<StoreCashOrderGateSetting> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STORE_CASH_ORDER_GATE_SETTING_KEY)
    .maybeSingle();
  const v = (error || !data ? null : data.value_json) as Record<string, unknown> | null;
  return {
    mode: normalizeStoreCashOrderGateMode(v?.value),
    reason: typeof v?.reason === "string" ? v.reason : null,
    changedBy: typeof v?.by === "string" ? v.by : null,
    changedAt: typeof v?.at === "string" ? v.at : null,
  };
}

export async function loadStoreCashOrderGateMode(sb: SupabaseClient): Promise<StoreCashOrderGateMode> {
  return (await loadStoreCashOrderGateSetting(sb)).mode;
}

export async function saveStoreCashOrderGateSetting(
  sb: SupabaseClient,
  input: { mode: StoreCashOrderGateMode; reason: string; adminUserId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: STORE_CASH_ORDER_GATE_SETTING_KEY,
      value_json: {
        value: input.mode,
        reason: input.reason,
        by: input.adminUserId,
        at: new Date().toISOString(),
      },
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

/** Cash positions for many stores (Admin list / Owner single) — same rule as the DB gate. */
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

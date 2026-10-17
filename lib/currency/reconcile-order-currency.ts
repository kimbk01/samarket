/**
 * F-04 / F-05 — Store order currency reconciliation (REPORT-ONLY by default).
 *
 * Finds orders whose terminal status and money side effects disagree:
 *  (a) completed  — no Coin sale credit (store_economic_point_ledger idempotency_key = sale_coin:{id})
 *  (b) refunded   — sale_coin exists but no coin_reversal:order:{id}, OR a commission obligation
 *                   that was neither waived nor sent to manual review (adjustment_status = 'none')
 *  (c) cancelled  — gift_certificate_redemptions still reversed = false
 * Orders whose store_settlements.settlement_status = 'paid' are excluded from candidates and
 * reported separately (money already left the platform — manual review only).
 *
 * WRITE MODE is impossible to enable by env alone. It requires ALL of:
 *   1. RECONCILE_WRITE_MODE_APPROVED === true (hardcoded; changing it needs an approved commit)
 *   2. request query `apply=1`
 *   3. env DIBAY_CURRENCY_RECONCILE_APPLY_FROM = ISO cutoff (only orders created_at >= cutoff)
 * The write path re-invokes ONLY existing idempotent writers, after re-reading order_status.
 * Reversal is never called on an order that is not currently 'refunded'.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { coinReversalIdempotencyKeyForOrder, reverseCoinCreditsForOrder } from "@/lib/currency/coin-reversal-writer";
import {
  platformHeldSaleAmountPhp,
  recognizeOrderCurrencyOnCompleted,
} from "@/lib/currency/recognize-order-currency-on-completed";
import { flagStoreCommissionReview } from "@/lib/stores/commission/store-commission-writer";
import { ensureStoreSettlementForCompletedOrder } from "@/lib/stores/ensure-store-settlement";
import { saleCoinIdempotencyKeyForOrder } from "@/lib/stores/confirmed-sale-revenue";

/**
 * HARD GATE — must stay `false` until an approved commit flips it. No env var, header or query
 * parameter can override this constant.
 */
export const RECONCILE_WRITE_MODE_APPROVED = false as const;

export const RECONCILE_APPLY_FROM_ENV = "DIBAY_CURRENCY_RECONCILE_APPLY_FROM" as const;
export const RECONCILE_ID_CAP = 200;
/** Max orders scanned per status per run (most recent first). */
export const RECONCILE_SCAN_LIMIT = 5000;
const PAGE_SIZE = 1000;
const IN_CHUNK = 150;

const STORE_ORDERS = "store_orders";
const COIN_LEDGER = "store_economic_point_ledger";
const SALE_FEE_OBLIGATIONS = "store_sale_fee_obligations";
const GIFT_REDEMPTIONS = "gift_certificate_redemptions";
const STORE_SETTLEMENTS = "store_settlements";
export const GIFT_CANCEL_ORDER_RESTORE_RPC = "gift_certificate_cancel_order_restore" as const;

type OrderRow = {
  id: string;
  order_status: string;
  created_at: string | null;
  payment_amount?: unknown;
  gift_redemption_amount?: unknown;
  platform_funded_amount?: unknown;
};

export type ReconcileBucket = { count: number; ids: string[]; truncated: boolean };

export type RefundedCandidate = {
  orderId: string;
  missingCoinReversal: boolean;
  saleFeeNotWaived: boolean;
};

export type ReconcileReport = {
  scannedAt: string;
  scanLimitPerStatus: number;
  scanTruncated: { completed: boolean; refunded: boolean; cancelled: boolean };
  completedMissingSaleCoin: ReconcileBucket;
  /** Completed orders with no platform-held amount (paid directly to the store) — no Coin owed. */
  completedZeroRevenueSkipped: number;
  refundedUnreversed: ReconcileBucket & {
    missingCoinReversal: number;
    saleFeeNotWaived: number;
  };
  cancelledGiftNotRestored: ReconcileBucket;
  excludedPaidSettlement: ReconcileBucket;
};

export type ReconcileCandidates = {
  completed: OrderRow[];
  refunded: Array<OrderRow & { missingCoinReversal: boolean; saleFeeNotWaived: boolean }>;
  cancelled: OrderRow[];
};

function bucket(ids: string[]): ReconcileBucket {
  return {
    count: ids.length,
    ids: ids.slice(0, RECONCILE_ID_CAP),
    truncated: ids.length > RECONCILE_ID_CAP,
  };
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function scanOrdersByStatus(
  sb: SupabaseClient,
  status: "completed" | "refunded" | "cancelled"
): Promise<{ rows: OrderRow[]; truncated: boolean }> {
  const rows: OrderRow[] = [];
  let truncated = false;
  for (let from = 0; from < RECONCILE_SCAN_LIMIT; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, RECONCILE_SCAN_LIMIT) - 1;
    const { data, error } = await sb
      .from(STORE_ORDERS)
      .select("id, order_status, created_at, payment_amount, gift_redemption_amount, platform_funded_amount")
      .eq("order_status", status)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`scan_${status}_failed:${error.message}`);
    const page = (data ?? []) as OrderRow[];
    for (const r of page) {
      const id = String(r.id ?? "").trim();
      if (id) rows.push({ ...r, id, order_status: String(r.order_status ?? "") });
    }
    if (page.length < to - from + 1) return { rows, truncated: false };
    if (to + 1 >= RECONCILE_SCAN_LIMIT) truncated = true;
  }
  return { rows, truncated };
}

async function existingLedgerKeys(sb: SupabaseClient, keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(keys, IN_CHUNK)) {
    if (!part.length) continue;
    const { data, error } = await sb.from(COIN_LEDGER).select("idempotency_key").in("idempotency_key", part);
    if (error) throw new Error(`ledger_lookup_failed:${error.message}`);
    for (const r of (data ?? []) as Array<{ idempotency_key?: string }>) {
      if (r.idempotency_key) found.add(String(r.idempotency_key));
    }
  }
  return found;
}

async function nonWaivedObligationOrderIds(sb: SupabaseClient, orderIds: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(orderIds, IN_CHUNK)) {
    if (!part.length) continue;
    const { data, error } = await sb
      .from(SALE_FEE_OBLIGATIONS)
      .select("order_id, status")
      .in("order_id", part)
      .neq("status", "waived")
      .eq("adjustment_status", "none");
    if (error) throw new Error(`obligation_lookup_failed:${error.message}`);
    for (const r of (data ?? []) as Array<{ order_id?: string }>) {
      if (r.order_id) found.add(String(r.order_id));
    }
  }
  return found;
}

async function unreversedGiftOrderIds(sb: SupabaseClient, orderIds: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(orderIds, IN_CHUNK)) {
    if (!part.length) continue;
    const { data, error } = await sb
      .from(GIFT_REDEMPTIONS)
      .select("order_id")
      .in("order_id", part)
      .eq("reversed", false);
    if (error) throw new Error(`gift_redemption_lookup_failed:${error.message}`);
    for (const r of (data ?? []) as Array<{ order_id?: string }>) {
      if (r.order_id) found.add(String(r.order_id));
    }
  }
  return found;
}

async function paidSettlementOrderIds(sb: SupabaseClient, orderIds: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(orderIds, IN_CHUNK)) {
    if (!part.length) continue;
    const { data, error } = await sb
      .from(STORE_SETTLEMENTS)
      .select("order_id, settlement_status")
      .in("order_id", part)
      .eq("settlement_status", "paid");
    if (error) throw new Error(`settlement_lookup_failed:${error.message}`);
    for (const r of (data ?? []) as Array<{ order_id?: string }>) {
      if (r.order_id) found.add(String(r.order_id));
    }
  }
  return found;
}

/** Read-only: builds the report and the in-memory candidate list. Performs NO writes. */
export async function buildOrderCurrencyReconcileReport(
  sb: SupabaseClient,
  nowIso: string = new Date().toISOString()
): Promise<{ report: ReconcileReport; candidates: ReconcileCandidates }> {
  const [completed, refunded, cancelled] = await Promise.all([
    scanOrdersByStatus(sb, "completed"),
    scanOrdersByStatus(sb, "refunded"),
    scanOrdersByStatus(sb, "cancelled"),
  ]);

  // (a) completed lacking sale_coin — Coin is minted only for the platform-held portion
  const completedWithRevenue = completed.rows.filter((o) => platformHeldSaleAmountPhp(o) > 0);
  const completedZeroRevenueSkipped = completed.rows.length - completedWithRevenue.length;
  const saleKeys = await existingLedgerKeys(
    sb,
    completedWithRevenue.map((o) => saleCoinIdempotencyKeyForOrder(o.id))
  );
  const aRaw = completedWithRevenue.filter((o) => !saleKeys.has(saleCoinIdempotencyKeyForOrder(o.id)));

  // (b) refunded: sale_coin w/o coin_reversal, or obligation not waived
  const refundedIds = refunded.rows.map((o) => o.id);
  const refundKeys = await existingLedgerKeys(sb, [
    ...refundedIds.map((id) => saleCoinIdempotencyKeyForOrder(id)),
    ...refundedIds.map((id) => coinReversalIdempotencyKeyForOrder(id)),
  ]);
  const obligationOpen = await nonWaivedObligationOrderIds(sb, refundedIds);
  const bRaw = refunded.rows
    .map((o) => ({
      ...o,
      missingCoinReversal:
        refundKeys.has(saleCoinIdempotencyKeyForOrder(o.id)) &&
        !refundKeys.has(coinReversalIdempotencyKeyForOrder(o.id)),
      saleFeeNotWaived: obligationOpen.has(o.id),
    }))
    .filter((o) => o.missingCoinReversal || o.saleFeeNotWaived);

  // (c) cancelled with unreversed gift redemptions
  const giftOpen = await unreversedGiftOrderIds(
    sb,
    cancelled.rows.map((o) => o.id)
  );
  const cRaw = cancelled.rows.filter((o) => giftOpen.has(o.id));

  // Exclude paid settlements from every bucket; report separately.
  const paid = await paidSettlementOrderIds(sb, [
    ...aRaw.map((o) => o.id),
    ...bRaw.map((o) => o.id),
    ...cRaw.map((o) => o.id),
  ]);
  const a = aRaw.filter((o) => !paid.has(o.id));
  const b = bRaw.filter((o) => !paid.has(o.id));
  const c = cRaw.filter((o) => !paid.has(o.id));

  const report: ReconcileReport = {
    scannedAt: nowIso,
    scanLimitPerStatus: RECONCILE_SCAN_LIMIT,
    scanTruncated: {
      completed: completed.truncated,
      refunded: refunded.truncated,
      cancelled: cancelled.truncated,
    },
    completedMissingSaleCoin: bucket(a.map((o) => o.id)),
    completedZeroRevenueSkipped,
    refundedUnreversed: {
      ...bucket(b.map((o) => o.id)),
      missingCoinReversal: b.filter((o) => o.missingCoinReversal).length,
      saleFeeNotWaived: b.filter((o) => o.saleFeeNotWaived).length,
    },
    cancelledGiftNotRestored: bucket(c.map((o) => o.id)),
    excludedPaidSettlement: bucket([...paid]),
  };

  return { report, candidates: { completed: a, refunded: b, cancelled: c } };
}

export type ReconcileWriteGate =
  | { allowed: true; cutoffIso: string }
  | {
      allowed: false;
      requested: boolean;
      reason:
        | "not_requested"
        | "write_mode_not_approved_in_code"
        | "apply_from_env_missing"
        | "apply_from_env_invalid";
    };

/**
 * Write gate. `approvedConstant` defaults to the hardcoded constant; production callers MUST NOT
 * pass it (the cron route never does — enforced by test).
 */
export function resolveReconcileWriteGate(input: {
  applyParam: string | null | undefined;
  envApplyFrom: string | null | undefined;
  approvedConstant?: boolean;
}): ReconcileWriteGate {
  const requested = String(input.applyParam ?? "").trim() === "1";
  if (!requested) return { allowed: false, requested: false, reason: "not_requested" };
  const approved = input.approvedConstant ?? RECONCILE_WRITE_MODE_APPROVED;
  if (approved !== true) {
    return { allowed: false, requested: true, reason: "write_mode_not_approved_in_code" };
  }
  const raw = String(input.envApplyFrom ?? "").trim();
  if (!raw) return { allowed: false, requested: true, reason: "apply_from_env_missing" };
  const ms = Date.parse(raw);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw) || !Number.isFinite(ms)) {
    return { allowed: false, requested: true, reason: "apply_from_env_invalid" };
  }
  return { allowed: true, cutoffIso: new Date(ms).toISOString() };
}

export type ReconcileWriteOutcome = {
  orderId: string;
  kind: "completed" | "refunded" | "cancelled";
  action: string;
  ok: boolean;
  detail?: string;
};

async function reReadOrderStatus(sb: SupabaseClient, orderId: string): Promise<string | null> {
  const { data, error } = await sb.from(STORE_ORDERS).select("id, order_status").eq("id", orderId).maybeSingle();
  if (error || !data) return null;
  return String((data as { order_status?: string }).order_status ?? "");
}

function onOrAfterCutoff(createdAt: string | null, cutoffIso: string): boolean {
  const ms = Date.parse(String(createdAt ?? ""));
  return Number.isFinite(ms) && ms >= Date.parse(cutoffIso);
}

/**
 * Write path — only runs with an allowed gate. Re-invokes existing idempotent writers.
 * Every branch re-reads order_status immediately before acting.
 */
export async function applyOrderCurrencyReconcileWrites(
  sb: SupabaseClient,
  candidates: ReconcileCandidates,
  gate: ReconcileWriteGate
): Promise<{ ok: true; outcomes: ReconcileWriteOutcome[] } | { ok: false; error: string }> {
  if (!gate.allowed) return { ok: false, error: gate.reason };
  const cutoff = gate.cutoffIso;
  const outcomes: ReconcileWriteOutcome[] = [];

  for (const o of candidates.completed) {
    if (!onOrAfterCutoff(o.created_at, cutoff)) continue;
    const status = await reReadOrderStatus(sb, o.id);
    if (status !== "completed") {
      outcomes.push({ orderId: o.id, kind: "completed", action: "skip_status_changed", ok: true, detail: String(status) });
      continue;
    }
    await ensureStoreSettlementForCompletedOrder(sb, o.id);
    const rec = await recognizeOrderCurrencyOnCompleted(sb, o.id);
    outcomes.push({
      orderId: o.id,
      kind: "completed",
      action: "recognize_order_currency_on_completed",
      ok: rec.ok,
      detail: rec.ok ? (rec.skipped ? "skipped" : undefined) : rec.error,
    });
  }

  for (const o of candidates.refunded) {
    if (!onOrAfterCutoff(o.created_at, cutoff)) continue;
    const status = await reReadOrderStatus(sb, o.id);
    if (status !== "refunded") {
      // Never reverse on a non-refunded order.
      outcomes.push({ orderId: o.id, kind: "refunded", action: "skip_status_changed", ok: true, detail: String(status) });
      continue;
    }
    if (o.missingCoinReversal) {
      const r = await reverseCoinCreditsForOrder(sb, { orderId: o.id, reason: "order_refund_reconcile" });
      outcomes.push({
        orderId: o.id,
        kind: "refunded",
        action: "reverse_coin_credits_for_order",
        ok: r.ok,
        detail: r.ok ? undefined : r.error,
      });
    }
    if (o.saleFeeNotWaived) {
      // Commission refunds are an admin decision — reconcile only queues the review.
      const r = await flagStoreCommissionReview(sb, o.id, "refunded");
      outcomes.push({
        orderId: o.id,
        kind: "refunded",
        action: "flag_store_commission_review",
        ok: r.ok,
        detail: r.ok ? undefined : r.error,
      });
    }
  }

  for (const o of candidates.cancelled) {
    if (!onOrAfterCutoff(o.created_at, cutoff)) continue;
    const status = await reReadOrderStatus(sb, o.id);
    if (status !== "cancelled") {
      outcomes.push({ orderId: o.id, kind: "cancelled", action: "skip_status_changed", ok: true, detail: String(status) });
      continue;
    }
    const { data, error } = await sb.rpc(GIFT_CANCEL_ORDER_RESTORE_RPC, { p_order_id: o.id });
    const row = (data ?? {}) as { ok?: boolean; error?: string };
    outcomes.push({
      orderId: o.id,
      kind: "cancelled",
      action: GIFT_CANCEL_ORDER_RESTORE_RPC,
      ok: !error && row.ok !== false,
      detail: error ? error.message : row.ok === false ? String(row.error ?? "") : undefined,
    });
  }

  return { ok: true, outcomes };
}

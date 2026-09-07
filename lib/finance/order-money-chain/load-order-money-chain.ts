/**
 * Load OrderMoneyChain from settlement + items + coin/cash ledgers + obligations.
 * No item-level fee/coin invention.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminOrderFinanceHref,
  ownerOrderFinanceHref,
  adminFinanceLedgerHref,
  ownerFinanceLedgerHref,
} from "@/lib/finance/deep-links";
import type { OrderMoneyChain, OrderMoneyChainEvent } from "@/lib/finance/order-money-chain/types";
import {
  BUSINESS_CASH_LEDGER_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import { projectStoreOrderFinancialFact } from "@/lib/stores/store-order-financial-fact";

function phpFromMinor(minor: number): number {
  return Math.trunc(minor) / 100;
}

export async function loadOrderMoneyChain(
  sb: SupabaseClient,
  input: { orderId: string; forOwnerStoreId?: string | null }
): Promise<OrderMoneyChain | null> {
  const orderId = input.orderId.trim();
  if (!orderId) return null;

  const { data: order } = await sb
    .from("store_orders")
    .select(
      "id, order_no, store_id, order_status, payment_status, payment_amount, delivery_fee_amount, discount_amount, store_funded_amount, platform_funded_amount, gift_redemption_amount, created_at, updated_at, buyer_user_id"
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const storeId = String((order as { store_id?: string }).store_id ?? "").trim();
  if (input.forOwnerStoreId && input.forOwnerStoreId.trim() !== storeId) {
    return null;
  }

  const [{ data: store }, { data: settlement }, { data: items }, { data: obligation }] =
    await Promise.all([
      sb
        .from("stores")
        .select("id, store_name, owner_user_id")
        .eq("id", storeId)
        .maybeSingle(),
      sb
        .from("store_settlements")
        .select(
          "id, order_id, store_id, gross_amount, platform_fee_amount, fixed_fee_amount, delivery_income_amount, discount_burden_amount, refund_amount, commission_reversal_amount, net_settlement_amount, settlement_status, settlement_due_date, paid_at, created_at, applied_fee_policy_snapshot, platform_fee_percent, commission_base_amount"
        )
        .eq("order_id", orderId)
        .maybeSingle(),
      sb
        .from("store_order_items")
        .select("id, product_id, product_title_snapshot, qty, subtotal")
        .eq("order_id", orderId),
      sb
        .from("store_sale_fee_obligations")
        .select(
          "id, order_id, fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, created_at, settled_at"
        )
        .eq("order_id", orderId)
        .maybeSingle(),
    ]);

  const ownerId =
    store && (store as { owner_user_id?: string }).owner_user_id
      ? String((store as { owner_user_id: string }).owner_user_id)
      : null;
  const storeName = store ? String((store as { store_name?: string }).store_name ?? "") : "";

  const fact = settlement
    ? projectStoreOrderFinancialFact({
        settlement: settlement as never,
        order: order as never,
        storeName,
      })
    : null;

  const feeDueMinor = obligation
    ? Math.trunc(Number((obligation as { fee_due_minor?: number }).fee_due_minor) || 0)
    : Math.round(((fact?.commission_amount ?? 0) + (fact?.fixed_fee_amount ?? 0) + (fact?.delivery_income_amount ?? 0)) * 100);
  const feePaidMinor = obligation
    ? Math.trunc(Number((obligation as { fee_paid_minor?: number }).fee_paid_minor) || 0)
    : 0;
  const outstandingMinor = obligation
    ? Math.trunc(Number((obligation as { fee_outstanding_minor?: number }).fee_outstanding_minor) || 0)
    : Math.max(0, feeDueMinor - feePaidMinor);

  const snap = fact?.applied_fee_policy_snapshot;
  const feeRate =
    fact?.commission_rate ??
    (snap && typeof (snap as { fee_percent?: unknown }).fee_percent === "number"
      ? Number((snap as { fee_percent: number }).fee_percent)
      : null);

  const [{ data: coinRows }, { data: cashRows }] = await Promise.all([
    sb
      .from(STORE_ECONOMIC_POINT_LEDGER_TABLE)
      .select("id, entry_kind, amount, balance_after, related_type, related_id, created_at, meta")
      .eq("store_id", storeId)
      .or(`related_id.eq.${orderId},idempotency_key.eq.sale_coin:${orderId}`)
      .order("created_at", { ascending: true })
      .limit(20),
    sb
      .from(BUSINESS_CASH_LEDGER_TABLE)
      .select(
        "id, entry_kind, direction, amount_minor, balance_after_minor, related_type, related_id, created_at, meta"
      )
      .eq("store_id", storeId)
      .or(`related_id.eq.${orderId},related_id.eq.sale_fee:order:${orderId}`)
      .order("created_at", { ascending: true })
      .limit(40),
  ]);

  // Also match sale_fee idempotency via meta / related if related_id is settlement id
  let coinEarned = 0;
  for (const row of (coinRows ?? []) as Array<Record<string, unknown>>) {
    const kind = String(row.entry_kind ?? "");
    const amt = Math.trunc(Number(row.amount) || 0);
    if (kind === "SALE_EARN" || kind === "GIFT_REDEMPTION_EARN") coinEarned += Math.max(0, amt);
    if (kind === "REVERSAL") coinEarned += amt; // typically negative
  }

  const timeline: OrderMoneyChainEvent[] = [];
  const completedAt =
    fact?.completed_at ||
    (order as { completed_at?: string | null }).completed_at ||
    (order as { updated_at?: string }).updated_at ||
    null;

  if (fact || (order as { order_status?: string }).order_status === "completed") {
    timeline.push({
      id: `order-completed:${orderId}`,
      at: String(completedAt ?? (order as { created_at?: string }).created_at ?? ""),
      kind: "ORDER_COMPLETED",
      wallet: "SETTLEMENT",
      label: "주문 완료",
      amount: fact?.gross_amount ?? Math.trunc(Number((order as { payment_amount?: number }).payment_amount) || 0),
      amountMinor: null,
      sourceTable: "store_orders",
      sourceId: orderId,
      relatedOrderId: orderId,
      href: adminOrderFinanceHref(orderId, storeId),
    });
  }

  if (settlement) {
    timeline.push({
      id: `settlement:${String((settlement as { id: string }).id)}`,
      at: String((settlement as { created_at?: string }).created_at ?? ""),
      kind: "ORDER_COMPLETED",
      wallet: "SETTLEMENT",
      label: "정산 스냅샷",
      amount: fact?.net_settlement_amount ?? null,
      amountMinor: null,
      sourceTable: "store_settlements",
      sourceId: String((settlement as { id: string }).id),
      relatedOrderId: orderId,
      href: adminOrderFinanceHref(orderId, storeId),
    });
  }

  for (const row of (cashRows ?? []) as Array<Record<string, unknown>>) {
    const kind = String(row.entry_kind ?? "");
    const id = String(row.id ?? "");
    const minor = Math.trunc(Number(row.amount_minor) || 0);
    const at = String(row.created_at ?? "");
    let eventKind: OrderMoneyChainEvent["kind"] = "OTHER";
    if (kind === "SALE_FEE") eventKind = "SALE_FEE";
    else if (kind === "SALE_FEE_SETTLEMENT") eventKind = "SALE_FEE_SETTLEMENT";
    else if (kind === "SALE_FEE_REVERSAL") eventKind = "REVERSAL";
    else if (kind === "CONVERT_FROM_STORE_POINTS") eventKind = "CONVERT";
    timeline.push({
      id: `cash:${id}`,
      at,
      kind: eventKind,
      wallet: "CASH",
      label: kind,
      amount: phpFromMinor(minor),
      amountMinor: minor,
      sourceTable: BUSINESS_CASH_LEDGER_TABLE,
      sourceId: id,
      relatedOrderId: orderId,
      href: adminFinanceLedgerHref({ wallet: "cash", storeId, ledgerId: id, orderId }),
    });
  }

  if (obligation && outstandingMinor > 0) {
    timeline.push({
      id: `obligation:${String((obligation as { id: string }).id)}`,
      at: String((obligation as { created_at?: string }).created_at ?? ""),
      kind: "SALE_FEE_OBLIGATION",
      wallet: "CASH",
      label: "미납 수수료",
      amount: phpFromMinor(outstandingMinor),
      amountMinor: outstandingMinor,
      sourceTable: "store_sale_fee_obligations",
      sourceId: String((obligation as { id: string }).id),
      relatedOrderId: orderId,
      href: adminFinanceLedgerHref({ wallet: "cash", storeId, orderId }),
    });
  }

  for (const row of (coinRows ?? []) as Array<Record<string, unknown>>) {
    const kind = String(row.entry_kind ?? "");
    const id = String(row.id ?? "");
    const amt = Math.trunc(Number(row.amount) || 0);
    let eventKind: OrderMoneyChainEvent["kind"] = "OTHER";
    if (kind === "SALE_EARN" || kind === "GIFT_REDEMPTION_EARN") eventKind = "SALE_EARN";
    else if (kind === "REVERSAL") eventKind = "REVERSAL";
    else if (kind === "CONVERT_TO_BUSINESS_CASH") eventKind = "CONVERT";
    timeline.push({
      id: `coin:${id}`,
      at: String(row.created_at ?? ""),
      kind: eventKind,
      wallet: "COIN",
      label: kind,
      amount: amt,
      amountMinor: null,
      sourceTable: STORE_ECONOMIC_POINT_LEDGER_TABLE,
      sourceId: id,
      relatedOrderId: orderId,
      href: adminFinanceLedgerHref({ wallet: "coin", storeId, ledgerId: id, orderId }),
    });
  }

  timeline.sort((a, b) => a.at.localeCompare(b.at));

  return {
    orderId,
    orderNo: String((order as { order_no?: string }).order_no ?? fact?.order_no ?? ""),
    storeId,
    storeName,
    ownerId,
    date: fact?.completed_at ?? completedAt,
    orderStatus: String((order as { order_status?: string }).order_status ?? ""),
    items: ((items ?? []) as Array<Record<string, unknown>>).map((it) => ({
      id: String(it.id ?? ""),
      productId: it.product_id == null ? null : String(it.product_id),
      title: String(it.product_title_snapshot ?? ""),
      qty: Math.trunc(Number(it.qty) || 0),
      subtotal: Math.trunc(Number(it.subtotal) || 0),
    })),
    financial: {
      currency: "PHP",
      gross: fact?.gross_amount ?? Math.trunc(Number((order as { payment_amount?: number }).payment_amount) || 0),
      settlementNet: fact?.net_settlement_amount ?? null,
      feeRateSnapshot: feeRate,
      feeDue: phpFromMinor(feeDueMinor),
      feeDueMinor,
      cashFeePaid: phpFromMinor(feePaidMinor),
      cashFeePaidMinor: feePaidMinor,
      outstandingFee: phpFromMinor(outstandingMinor),
      outstandingFeeMinor: outstandingMinor,
      coinEarned,
      refundAmount: fact?.refund_amount ?? 0,
      settlementStatus: fact?.settlement_status ?? null,
      settlementId: fact?.settlement_id ?? (settlement ? String((settlement as { id: string }).id) : null),
      obligationId: obligation ? String((obligation as { id: string }).id) : null,
    },
    timeline,
    adminOrderHref: adminOrderFinanceHref(orderId, storeId),
    ownerOrderHref: ownerOrderFinanceHref(storeId, orderId),
  };
}

export function ownerChainEventHref(
  storeId: string,
  event: OrderMoneyChainEvent
): string | null {
  if (event.wallet === "CASH") {
    return ownerFinanceLedgerHref({
      storeId,
      wallet: "cash",
      ledgerId: event.sourceId,
      orderId: event.relatedOrderId,
    });
  }
  if (event.wallet === "COIN") {
    return ownerFinanceLedgerHref({
      storeId,
      wallet: "coin",
      ledgerId: event.sourceId,
      orderId: event.relatedOrderId,
    });
  }
  return ownerOrderFinanceHref(storeId, event.relatedOrderId);
}

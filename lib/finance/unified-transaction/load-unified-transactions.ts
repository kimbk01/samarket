/**
 * Load unified transactions from canonical ledgers only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceUnifiedTx, FinanceUnifiedTxQuery } from "@/lib/finance/unified-transaction/types";
import {
  BUSINESS_CASH_LEDGER_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";

function asMeta(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

export async function loadUnifiedFinanceTransactions(
  sb: SupabaseClient,
  query: FinanceUnifiedTxQuery = {}
): Promise<FinanceUnifiedTx[]> {
  const limit = Math.min(Math.max(query.limit ?? 80, 1), 200);
  const wallet = query.wallet ?? null;
  const storeId = query.storeId?.trim() || null;
  const orderId = query.orderId?.trim() || null;
  const memberId = query.memberId?.trim() || null;
  const typeFilter = query.type?.trim() || null;
  let out: FinanceUnifiedTx[] = [];

  const wantCash = !wallet || wallet === "CASH";
  const wantCoin = !wallet || wallet === "COIN";
  const wantPoint = !wallet || wallet === "POINT";

  if (wantCash) {
    let q = sb
      .from(BUSINESS_CASH_LEDGER_TABLE)
      .select(
        "id, store_id, entry_kind, direction, amount_minor, balance_after_minor, related_type, related_id, actor_user_id, meta, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (storeId) q = q.eq("store_id", storeId);
    if (query.fromIso) q = q.gte("created_at", query.fromIso);
    if (query.toIso) q = q.lte("created_at", query.toIso);
    if (typeFilter) q = q.eq("entry_kind", typeFilter);
    if (orderId) q = q.or(`related_id.eq.${orderId},related_id.ilike.%${orderId}%`);
    const { data } = await q;
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.id ?? "");
      const dir = String(row.direction ?? "").toLowerCase() === "credit" ? "credit" : "debit";
      const minor = Math.trunc(Number(row.amount_minor) || 0);
      const meta = asMeta(row.meta);
      const relatedType = String(row.related_type ?? "");
      const relatedId = String(row.related_id ?? "");
      const entryKind = String(row.entry_kind ?? "");
      const rt = relatedType.toLowerCase();
      const ek = entryKind.toUpperCase();
      let adId: string | null = null;
      if (
        rt.includes("delivery") ||
        rt.includes("ad") ||
        ek.includes("AD_") ||
        ek.includes("PARTNER_")
      ) {
        adId =
          relatedId ||
          (meta.application_id == null ? null : String(meta.application_id)) ||
          (meta.ad_id == null ? null : String(meta.ad_id));
      }
      const orderLinked =
        Boolean(relatedId) &&
        (ek.includes("SALE_FEE") ||
          ek.includes("SALE_EARN") ||
          rt.includes("order") ||
          rt.includes("sale_fee") ||
          rt.includes("settlement") ||
          (Boolean(orderId) && relatedId.includes(String(orderId))));
      out.push({
        id,
        txKey: `cash:${id}`,
        occurredAt: String(row.created_at ?? ""),
        wallet: "CASH",
        entryKind,
        direction: dir,
        amount: minor / 100,
        amountMinor: minor,
        balanceAfter: null,
        balanceAfterMinor: Math.trunc(Number(row.balance_after_minor) || 0),
        storeId: row.store_id == null ? null : String(row.store_id),
        storeName: null,
        ownerId: row.actor_user_id == null ? null : String(row.actor_user_id),
        memberId: null,
        memberLabel: null,
        orderId: orderLinked ? relatedId : null,
        adId,
        status: null,
        relatedType: relatedType || null,
        relatedId: relatedId || null,
        sourceTable: BUSINESS_CASH_LEDGER_TABLE,
        meta,
      });
    }
  }

  if (wantCoin) {
    let q = sb
      .from(STORE_ECONOMIC_POINT_LEDGER_TABLE)
      .select(
        "id, store_id, entry_kind, amount, balance_after, related_type, related_id, actor_user_id, meta, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (storeId) q = q.eq("store_id", storeId);
    if (query.fromIso) q = q.gte("created_at", query.fromIso);
    if (query.toIso) q = q.lte("created_at", query.toIso);
    if (typeFilter) q = q.eq("entry_kind", typeFilter);
    if (orderId) q = q.or(`related_id.eq.${orderId},idempotency_key.eq.sale_coin:${orderId}`);
    const { data } = await q;
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.id ?? "");
      const amt = Math.trunc(Number(row.amount) || 0);
      const relatedId = String(row.related_id ?? "");
      const entryKind = String(row.entry_kind ?? "");
      const meta = asMeta(row.meta);
      const orderFromMeta =
        meta.order_id == null ? null : String(meta.order_id).trim() || null;
      out.push({
        id,
        txKey: `coin:${id}`,
        occurredAt: String(row.created_at ?? ""),
        wallet: "COIN",
        entryKind,
        direction: amt >= 0 ? "credit" : "debit",
        amount: Math.abs(amt),
        amountMinor: null,
        balanceAfter: Math.trunc(Number(row.balance_after) || 0),
        balanceAfterMinor: null,
        storeId: row.store_id == null ? null : String(row.store_id),
        storeName: null,
        ownerId: row.actor_user_id == null ? null : String(row.actor_user_id),
        memberId: null,
        memberLabel: null,
        orderId: relatedId || orderFromMeta,
        adId: null,
        status: null,
        relatedType: row.related_type == null ? null : String(row.related_type),
        relatedId: relatedId || null,
        sourceTable: STORE_ECONOMIC_POINT_LEDGER_TABLE,
        meta,
      });
    }
  }

  if (wantPoint && !storeId) {
    let q = sb
      .from("point_ledger")
      .select(
        "id, user_id, entry_type, amount, balance_after, related_type, related_id, description, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (memberId) q = q.eq("user_id", memberId);
    if (query.fromIso) q = q.gte("created_at", query.fromIso);
    if (query.toIso) q = q.lte("created_at", query.toIso);
    const { data } = await q;
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.id ?? "");
      const delta = Math.trunc(Number(row.amount) || 0);
      const entryType = String(row.entry_type ?? "");
      const relatedType = String(row.related_type ?? "");
      const relatedId = String(row.related_id ?? "");
      const desc = String(row.description ?? "");
      let entryKind = "POINT_SPEND";
      if (/charge|top.?up/i.test(entryType) || /charge/i.test(relatedType)) entryKind = "POINT_CHARGE";
      else if (/hold/i.test(entryType) || /hold/i.test(relatedType) || /ad_hold/i.test(entryType))
        entryKind = "POINT_HOLD";
      else if (/capture|purchase|ad_purchase/i.test(entryType)) entryKind = "POINT_CAPTURE";
      else if (/release|ad_hold_release/i.test(entryType)) entryKind = "POINT_RELEASE";
      else if (/reward|grant|credit/i.test(entryType)) entryKind = "POINT_REWARD";
      else if (/reclaim/i.test(entryType)) entryKind = "POINT_RECLAIM";
      else if (/refund/i.test(entryType)) entryKind = "POINT_REFUND";
      else if (delta > 0) entryKind = "POINT_REWARD";
      if (typeFilter && entryKind !== typeFilter && entryType !== typeFilter) continue;
      out.push({
        id,
        txKey: `point:${id}`,
        occurredAt: String(row.created_at ?? ""),
        wallet: "POINT",
        entryKind,
        direction: delta >= 0 ? "credit" : "debit",
        amount: Math.abs(delta),
        amountMinor: null,
        balanceAfter: Math.trunc(Number(row.balance_after) || 0),
        balanceAfterMinor: null,
        storeId: null,
        storeName: null,
        ownerId: null,
        memberId: row.user_id == null ? null : String(row.user_id),
        memberLabel: null,
        orderId: null,
        adId:
          /ad|feed|promotion|boost/i.test(relatedType) || /ad|feed|promotion|boost/i.test(entryType)
            ? relatedId || null
            : null,
        status: null,
        relatedType: relatedType || entryType || null,
        relatedId: relatedId || null,
        sourceTable: "point_ledger",
        meta: { description: desc, entry_type: entryType },
      });
    }
  }

  // Enrich store names
  const storeIds = Array.from(new Set(out.map((r) => r.storeId).filter(Boolean))) as string[];
  if (storeIds.length > 0) {
    const { data: stores } = await sb.from("stores").select("id, store_name").in("id", storeIds);
    const nameById = new Map(
      ((stores ?? []) as Array<{ id: string; store_name?: string }>).map((s) => [
        s.id,
        String(s.store_name ?? ""),
      ])
    );
    for (const row of out) {
      if (row.storeId) row.storeName = nameById.get(row.storeId) ?? null;
    }
  }

  if (query.adId) {
    const ad = query.adId.trim();
    return out.filter((r) => r.adId === ad || r.relatedId === ad).slice(0, limit);
  }

  if (query.direction === "credit" || query.direction === "debit") {
    const dir = query.direction;
    out = out.filter((r) => r.direction === dir);
  }

  out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return out.slice(0, limit);
}

export async function loadUnifiedFinanceTransactionByKey(
  sb: SupabaseClient,
  txKey: string
): Promise<FinanceUnifiedTx | null> {
  const key = txKey.trim();
  const [kind, id] = key.split(":");
  if (!kind || !id) return null;
  if (kind === "cash") {
    const rows = await loadUnifiedFinanceTransactions(sb, { wallet: "CASH", limit: 200 });
    return rows.find((r) => r.id === id) ?? null;
  }
  if (kind === "coin") {
    const rows = await loadUnifiedFinanceTransactions(sb, { wallet: "COIN", limit: 200 });
    return rows.find((r) => r.id === id) ?? null;
  }
  if (kind === "point") {
    const rows = await loadUnifiedFinanceTransactions(sb, { wallet: "POINT", limit: 200 });
    return rows.find((r) => r.id === id) ?? null;
  }
  return null;
}

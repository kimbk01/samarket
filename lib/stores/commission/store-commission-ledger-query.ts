import type { StoreCommissionRowState } from "@/lib/stores/commission/store-commission-contract";

const STATES: readonly StoreCommissionRowState[] = [
  "charged",
  "outstanding",
  "review_required",
  "refunded",
  "kept",
];

export type StoreCommissionLedgerQuery = {
  storeId: string;
  from: string | null;
  to: string | null;
  state: StoreCommissionRowState | "all";
  orderNo: string | null;
  limit: number;
  offset: number;
};

/** Same query contract for Admin and Owner ledger routes. */
export function parseStoreCommissionLedgerQuery(sp: URLSearchParams): StoreCommissionLedgerQuery {
  const day = (v: string | null) => {
    const t = String(v ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  };
  const stateRaw = String(sp.get("state") ?? "").trim();
  const limit = Number(sp.get("limit") ?? "100");
  const offset = Number(sp.get("offset") ?? "0");
  return {
    storeId: String(sp.get("store_id") ?? sp.get("storeId") ?? "").trim(),
    from: day(sp.get("from")),
    to: day(sp.get("to")),
    state: (STATES as readonly string[]).includes(stateRaw) ? (stateRaw as StoreCommissionRowState) : "all",
    orderNo: String(sp.get("order_no") ?? "").trim() || null,
    limit: Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.round(limit))) : 100,
    offset: Number.isFinite(offset) ? Math.max(0, Math.round(offset)) : 0,
  };
}

export function buildStoreCommissionLedgerSearch(q: Partial<StoreCommissionLedgerQuery>): string {
  const sp = new URLSearchParams();
  if (q.storeId) sp.set("store_id", q.storeId);
  if (q.from) sp.set("from", q.from);
  if (q.to) sp.set("to", q.to);
  if (q.state && q.state !== "all") sp.set("state", q.state);
  if (q.orderNo) sp.set("order_no", q.orderNo);
  if (q.limit) sp.set("limit", String(q.limit));
  if (q.offset) sp.set("offset", String(q.offset));
  return sp.toString();
}

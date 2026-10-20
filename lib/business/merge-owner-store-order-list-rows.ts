import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { sortOwnerStoreOrderListRowsDesc } from "@/lib/business/owner-store-order-list-row-bridge";

function updatedAtMs(row: { updated_at?: string | null }): number {
  const u = typeof row.updated_at === "string" ? row.updated_at.trim() : "";
  if (!u) return 0;
  const t = new Date(u).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** 동일 id — `updated_at` 이 더 최신인 쪽의 진행 필드 우선 (stale snapshot 되돌림 방지) */
export function pickNewerOwnerStoreOrderListRow(
  existing: OwnerStoreOrderListRow,
  incoming: OwnerStoreOrderListRow
): OwnerStoreOrderListRow {
  const existingMs = updatedAtMs(existing);
  const incomingMs = updatedAtMs(incoming);
  const newer =
    incomingMs > existingMs ? incoming : existingMs > incomingMs ? existing : existing;
  const older = newer === incoming ? existing : incoming;
  return {
    ...older,
    ...newer,
    items: newer.items.length > 0 ? newer.items : older.items,
    buyer_public_label: newer.buyer_public_label ?? older.buyer_public_label,
    delivery: newer.delivery ?? older.delivery,
    discount_amount: newer.discount_amount ?? older.discount_amount,
  };
}

/** GET 목록 응답을 기존 state 와 병합 — row 단위로 최신 `updated_at` 유지 */
export function mergeOwnerStoreOrderListRows(
  prev: OwnerStoreOrderListRow[],
  incoming: OwnerStoreOrderListRow[]
): OwnerStoreOrderListRow[] {
  const prevById = new Map(prev.map((r) => [r.id, r]));
  const merged = incoming.map((row) => {
    const ex = prevById.get(row.id);
    return ex ? pickNewerOwnerStoreOrderListRow(ex, row) : row;
  });
  return sortOwnerStoreOrderListRowsDesc(merged);
}

const OWNER_ORDER_TERMINAL_STATUSES = new Set(["completed", "cancelled", "refunded"]);

function isOlderRow(a: OwnerStoreOrderListRow, b: OwnerStoreOrderListRow): boolean {
  const am = new Date(a.created_at).getTime();
  const bm = new Date(b.created_at).getTime();
  if (am !== bm) return am < bm;
  return a.id < b.id;
}

/**
 * 「이전 주문 더 보기」 첫 커서 — 첫 페이지 = 최근 창 + 미종료 주문 전부(RPC).
 * 최근 창 안의 종료 주문 중 가장 오래된 행 다음부터 받으면 빠지는 종료 주문이 없다(사이 구간은 미종료라 이미 로드됨).
 */
export function ownerOrdersHistoryStartCursor(rows: OwnerStoreOrderListRow[]): string | null {
  const terminal = rows.filter((r) => OWNER_ORDER_TERMINAL_STATUSES.has(r.order_status));
  const pool = terminal.length > 0 ? terminal : rows;
  let oldest: OwnerStoreOrderListRow | null = null;
  for (const r of pool) {
    if (!r.created_at || !r.id) continue;
    if (!oldest || isOlderRow(r, oldest)) oldest = r;
  }
  return oldest ? `${oldest.created_at}|${oldest.id}` : null;
}

/**
 * 조용한 새로고침 병합 후 — 응답에 없는 이전 종료 주문(더 보기로 붙인 이력·최근 창 밖으로 밀린 행)을 유지한다.
 * 미종료 주문은 첫 페이지에 항상 실리므로 응답에 없으면 유지하지 않는다.
 */
export function retainOwnerOrderHistoryRows(
  prev: OwnerStoreOrderListRow[],
  merged: OwnerStoreOrderListRow[]
): OwnerStoreOrderListRow[] {
  const ids = new Set(merged.map((r) => r.id));
  const kept = prev.filter((r) => !ids.has(r.id) && OWNER_ORDER_TERMINAL_STATUSES.has(r.order_status));
  if (kept.length === 0) return merged;
  return sortOwnerStoreOrderListRowsDesc([...merged, ...kept]);
}

/** 이전 페이지 행을 현재 목록에 붙인다 — 같은 id 는 최신 `updated_at` 유지. */
export function appendOwnerOrderHistoryRows(
  current: OwnerStoreOrderListRow[],
  older: OwnerStoreOrderListRow[]
): OwnerStoreOrderListRow[] {
  const byId = new Map(current.map((r) => [r.id, r]));
  for (const r of older) {
    const ex = byId.get(r.id);
    byId.set(r.id, ex ? pickNewerOwnerStoreOrderListRow(ex, r) : r);
  }
  return sortOwnerStoreOrderListRowsDesc([...byId.values()]);
}

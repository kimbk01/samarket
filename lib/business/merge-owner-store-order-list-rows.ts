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

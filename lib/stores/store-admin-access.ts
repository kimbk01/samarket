/** 매장 어드민(오너 대시보드) 접근은 승인된 매장이 있을 때만 허용 */

export type MeStoreRowForAccess = {
  id: string;
  approval_status: string;
};

export function hasApprovedOwnerStore(stores: Array<{ approval_status?: unknown }>): boolean {
  return stores.some((s) => String(s.approval_status ?? "") === "approved");
}

export type OwnerStoreGateState =
  | { kind: "approved" }
  | { kind: "empty" }
  | { kind: "pending"; approval_status: string; rejected_reason: string | null; revision_note: string | null };

export function getOwnerStoreGateState(
  stores: Array<
    MeStoreRowForAccess & { rejected_reason?: string | null; revision_note?: string | null }
  >
): OwnerStoreGateState {
  if (!stores.length) return { kind: "empty" };
  if (hasApprovedOwnerStore(stores)) return { kind: "approved" };
  const s = stores[0]!;
  return {
    kind: "pending",
    approval_status: String(s.approval_status ?? ""),
    rejected_reason: s.rejected_reason ?? null,
    revision_note: s.revision_note ?? null,
  };
}

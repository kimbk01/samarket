/**
 * Parse unified owner store orders list snapshot RPC payload.
 */
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { normalizeOwnerStoreOrderListRows } from "@/lib/business/owner-store-order-list-row-bridge";

export type OwnerStoreOrdersListSnapshotPayloadJson = {
  ok?: boolean;
  error?: string;
  orders?: unknown[];
  next_cursor?: string | null;
  status_counts_optional?: {
    pending_accept_count?: number;
    refund_requested_count?: number;
    pending_delivery_count?: number;
  };
  store_pickup_address?: {
    region?: string | null;
    city?: string | null;
    district?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
  } | null;
  updated_at?: string;
};

export function parseOwnerStoreOrdersListSnapshotRpcData(
  data: unknown
): OwnerStoreOrdersListSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as OwnerStoreOrdersListSnapshotPayloadJson;
}

export function ownerStoreOrdersListFromPayload(
  payload: OwnerStoreOrdersListSnapshotPayloadJson
): OwnerStoreOrderListRow[] {
  if (!Array.isArray(payload.orders)) return [];
  return normalizeOwnerStoreOrderListRows(
    payload.orders.filter((o) => o && typeof o === "object") as OwnerStoreOrderListRow[]
  );
}

export function ownerStoreOrdersListSnapshotGateFromPayload(
  payload: OwnerStoreOrdersListSnapshotPayloadJson
): { ok: true } | { ok: false; error: string; status: number } {
  if (payload.ok === false) {
    const err = String(payload.error ?? "forbidden");
    return { ok: false, error: err, status: err === "forbidden" ? 403 : 500 };
  }
  if (payload.ok !== true) return { ok: false, error: "invalid_snapshot", status: 500 };
  return { ok: true };
}

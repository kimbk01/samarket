import type { SupabaseClient } from "@supabase/supabase-js";

export const BUYER_STORE_ORDER_DETAIL_SNAPSHOT_RPC = "get_buyer_store_order_detail_snapshot";
export const OWNER_STORE_ORDER_DETAIL_SNAPSHOT_RPC = "get_owner_store_order_detail_snapshot";

export type BuyerStoreOrderDetailSnapshotGate =
  | {
      ok: true;
      order: Record<string, unknown>;
      items: Record<string, unknown>[];
      store: Record<string, unknown>;
      delivery: Record<string, unknown> | null;
      review: Record<string, unknown> | null;
      rpc_wall_ms: number;
    }
  | { ok: false; status: number; error: string; rpc_wall_ms: number };

export type OwnerStoreOrderDetailSnapshotGate =
  | {
      ok: true;
      store: Record<string, unknown>;
      order: Record<string, unknown>;
      items: Record<string, unknown>[];
      delivery: Record<string, unknown> | null;
      review_status: string;
      rpc_wall_ms: number;
    }
  | { ok: false; status: number; error: string; rpc_wall_ms: number };

function mapBuyerPayload(data: unknown, rpcWallMs: number): BuyerStoreOrderDetailSnapshotGate | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.ok === false) {
    const err = typeof d.error === "string" ? d.error : "not_found";
    return { ok: false, status: err === "not_found" ? 404 : 500, error: err, rpc_wall_ms: rpcWallMs };
  }
  if (d.ok !== true || !d.order) return null;
  return {
    ok: true,
    order: d.order as Record<string, unknown>,
    items: Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [],
    store: (d.store as Record<string, unknown>) ?? {},
    delivery: (d.delivery as Record<string, unknown>) ?? null,
    review: (d.review as Record<string, unknown>) ?? null,
    rpc_wall_ms: rpcWallMs,
  };
}

function mapOwnerPayload(data: unknown, rpcWallMs: number): OwnerStoreOrderDetailSnapshotGate | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.ok === false) {
    const err = typeof d.error === "string" ? d.error : "forbidden";
    const status =
      err === "order_not_found" || err === "store_not_found"
        ? 404
        : err === "forbidden"
          ? 403
          : 500;
    return { ok: false, status, error: err, rpc_wall_ms: rpcWallMs };
  }
  if (d.ok !== true || !d.order) return null;
  return {
    ok: true,
    store: (d.store as Record<string, unknown>) ?? {},
    order: d.order as Record<string, unknown>,
    items: Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [],
    delivery: (d.delivery as Record<string, unknown>) ?? null,
    review_status: String(d.review_status ?? "not_applicable"),
    rpc_wall_ms: rpcWallMs,
  };
}

export async function fetchBuyerStoreOrderDetailSnapshot(
  sb: SupabaseClient<any>,
  buyerUserId: string,
  orderId: string
): Promise<BuyerStoreOrderDetailSnapshotGate | null> {
  const uid = buyerUserId.trim();
  const oid = orderId.trim();
  if (!uid || !oid) return null;

  const rpc0 = Date.now();
  const { data, error } = await sb.rpc(BUYER_STORE_ORDER_DETAIL_SNAPSHOT_RPC, {
    p_user_id: uid,
    p_order_id: oid,
  });
  const rpcWallMs = Date.now() - rpc0;

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[buyer-store-order-detail-snapshot-rpc-miss]", error.message, { rpc_wall_ms: rpcWallMs });
    }
    return null;
  }

  const mapped = mapBuyerPayload(data, rpcWallMs);
  if (mapped?.ok && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.info("[buyer-store-order-detail-snapshot-rpc-hit]", { order_id: oid, rpc_wall_ms: rpcWallMs });
  }
  return mapped;
}

export async function fetchOwnerStoreOrderDetailSnapshot(
  sb: SupabaseClient<any>,
  ownerUserId: string,
  storeId: string,
  orderId: string
): Promise<OwnerStoreOrderDetailSnapshotGate | null> {
  const uid = ownerUserId.trim();
  const sid = storeId.trim();
  const oid = orderId.trim();
  if (!uid || !sid || !oid) return null;

  const rpc0 = Date.now();
  const { data, error } = await sb.rpc(OWNER_STORE_ORDER_DETAIL_SNAPSHOT_RPC, {
    p_user_id: uid,
    p_store_id: sid,
    p_order_id: oid,
  });
  const rpcWallMs = Date.now() - rpc0;

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[owner-store-order-detail-snapshot-rpc-miss]", error.message, { rpc_wall_ms: rpcWallMs });
    }
    return null;
  }

  const mapped = mapOwnerPayload(data, rpcWallMs);
  if (mapped?.ok && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.info("[owner-store-order-detail-snapshot-rpc-hit]", {
      store_id: sid,
      order_id: oid,
      rpc_wall_ms: rpcWallMs,
    });
  }
  return mapped;
}

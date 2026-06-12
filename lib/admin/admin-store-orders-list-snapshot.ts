/**
 * ASO1 — admin store orders list snapshot RPC (single round-trip).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapStoreOrderToAdminDelivery,
  type StoreOrderItemRow,
  type StoreOrderRow,
} from "@/lib/admin/map-store-order-to-admin-delivery";

export const ADMIN_STORE_ORDERS_LIST_SNAPSHOT_RPC = "get_admin_store_orders_list_snapshot";

export type AdminStoreOrdersListSnapshotFilters = {
  orderId?: string;
  orderNo?: string;
  storeId?: string;
  buyerUserId?: string;
  paymentStatus?: string;
  orderStatus?: string;
  limit: number;
  includeItems: boolean;
};

type SnapshotOrderEnvelope = {
  order: StoreOrderRow;
  store_name: string;
  store_slug: string;
  store_owner_user_id: string | null;
  buyer_display_name: string;
  store_owner_name: string;
  items?: StoreOrderItemRow[] | null;
};

export type AdminStoreOrdersListSnapshotResult =
  | { ok: true; orders: Record<string, unknown>[]; via: "snapshot_rpc" }
  | { ok: false; reason: "rpc_missing" | "rpc_error" | "invalid_payload" };

function parseEnvelope(raw: unknown): SnapshotOrderEnvelope | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const order = o.order;
  if (!order || typeof order !== "object") return null;
  return {
    order: order as StoreOrderRow,
    store_name: typeof o.store_name === "string" ? o.store_name : "",
    store_slug: typeof o.store_slug === "string" ? o.store_slug : "",
    store_owner_user_id:
      typeof o.store_owner_user_id === "string" ? o.store_owner_user_id : null,
    buyer_display_name:
      typeof o.buyer_display_name === "string" ? o.buyer_display_name : "",
    store_owner_name: typeof o.store_owner_name === "string" ? o.store_owner_name : "—",
    items: Array.isArray(o.items) ? (o.items as StoreOrderItemRow[]) : [],
  };
}

function isRpcMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("get_admin_store_orders_list_snapshot") ||
    m.includes("could not find the function") ||
    m.includes("does not exist")
  );
}

export async function tryLoadAdminStoreOrdersListFromSnapshot(
  sb: SupabaseClient,
  filters: AdminStoreOrdersListSnapshotFilters
): Promise<AdminStoreOrdersListSnapshotResult> {
  const { data, error } = await sb.rpc(ADMIN_STORE_ORDERS_LIST_SNAPSHOT_RPC, {
    p_order_id: filters.orderId || null,
    p_order_no: filters.orderNo || "",
    p_store_id: filters.storeId || null,
    p_buyer_user_id: filters.buyerUserId || null,
    p_payment_status: filters.paymentStatus || "",
    p_order_status: filters.orderStatus || "",
    p_limit: filters.limit,
    p_include_items: filters.includeItems,
  });

  if (error) {
    const msg = error.message ?? String(error);
    if (isRpcMissingError(msg)) return { ok: false, reason: "rpc_missing" };
    return { ok: false, reason: "rpc_error" };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, reason: "invalid_payload" };
  }
  const payload = data as { ok?: boolean; orders?: unknown[] };
  if (payload.ok !== true || !Array.isArray(payload.orders)) {
    return { ok: false, reason: "invalid_payload" };
  }

  const orders = payload.orders
    .map((row) => parseEnvelope(row))
    .filter((row): row is SnapshotOrderEnvelope => row != null)
    .map((row) => {
      const sid = row.order.store_id;
      const buyerId = row.order.buyer_user_id;
      const ownerId = row.store_owner_user_id ?? "";
      const base = {
        id: row.order.id,
        order_no: row.order.order_no,
        store_id: sid,
        store_name: row.store_name,
        buyer_user_id: buyerId,
        payment_amount: Math.round(Number(row.order.payment_amount) || 0),
        payment_status: row.order.payment_status,
        order_status: row.order.order_status,
        fulfillment_type: row.order.fulfillment_type,
        created_at: row.order.created_at,
      };
      if (!filters.includeItems) return base;
      const mapped = mapStoreOrderToAdminDelivery({
        order: row.order,
        items: row.items ?? [],
        storeName: row.store_name,
        storeSlug: row.store_slug,
        storeOwnerUserId: ownerId,
        storeOwnerName: row.store_owner_name,
        buyerDisplayName: row.buyer_display_name,
      });
      return { ...base, admin_delivery: mapped };
    });

  return { ok: true, orders, via: "snapshot_rpc" };
}

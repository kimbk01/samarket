import { mapApiOrderToOwnerOrder, type ApiStoreOrderRow } from "./map-api-order-to-owner";
import type { OwnerOrder } from "./types";

export type OwnerOrdersListMeta = {
  owner_accept_requires_payment: boolean;
  refund_requested_count: number;
};

export async function fetchOwnerOrdersMetaRemote(
  storeId: string
): Promise<{ ok: true; meta: OwnerOrdersListMeta } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/me/stores/${encodeURIComponent(storeId)}/orders?meta_only=1`,
    { credentials: "include", cache: "no-store" }
  );
  if (res.status === 401) return { ok: false, error: "unauthorized" };
  const json = await res.json().catch(() => ({}));
  if (!json?.ok || !json.meta) {
    return { ok: false, error: typeof json?.error === "string" ? json.error : "meta_failed" };
  }
  const meta: OwnerOrdersListMeta = {
    owner_accept_requires_payment: json.meta.owner_accept_requires_payment !== false,
    refund_requested_count: Number(json.meta.refund_requested_count) || 0,
  };
  return { ok: true, meta };
}

export async function fetchOwnerOrdersRemote(
  storeId: string,
  ctx: { storeSlug: string; storeName: string }
): Promise<{ ok: true; orders: OwnerOrder[]; meta: OwnerOrdersListMeta } | { ok: false; error: string }> {
  const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/orders`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) return { ok: false, error: "로그인이 필요합니다." };
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) {
    return { ok: false, error: typeof json?.error === "string" ? json.error : "목록을 불러오지 못했습니다." };
  }
  const rows = (json.orders ?? []) as ApiStoreOrderRow[];
  const meta: OwnerOrdersListMeta = {
    owner_accept_requires_payment: !!json.meta?.owner_accept_requires_payment,
    refund_requested_count: Number(json.meta?.refund_requested_count) || 0,
  };
  const orders = rows.map((r) =>
    mapApiOrderToOwnerOrder(r, { storeId, storeSlug: ctx.storeSlug, storeName: ctx.storeName })
  );
  return { ok: true, orders, meta };
}

export async function fetchOwnerOrderRemote(
  storeId: string,
  orderId: string,
  ctx: { storeSlug: string; storeName: string }
): Promise<{ ok: true; order: OwnerOrder } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`,
    { credentials: "include", cache: "no-store" }
  );
  if (res.status === 401) return { ok: false, error: "로그인이 필요합니다." };
  if (res.status === 404) return { ok: false, error: "주문을 찾을 수 없습니다." };
  const json = await res.json().catch(() => ({}));
  if (!json?.ok || !json.order) {
    return { ok: false, error: typeof json?.error === "string" ? json.error : "불러오지 못했습니다." };
  }
  const order = mapApiOrderToOwnerOrder(json.order as ApiStoreOrderRow, {
    storeId,
    storeSlug: ctx.storeSlug,
    storeName: ctx.storeName,
  });
  return { ok: true, order };
}

export async function patchOwnerOrderStatusRemote(
  storeId: string,
  orderId: string,
  order_status: string
): Promise<
  { ok: true; order_status: string } | { ok: false; error: string }
> {
  const res = await fetch(
    `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_status }),
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    const err = typeof json?.error === "string" ? json.error : `처리 실패 (${res.status})`;
    return { ok: false, error: err };
  }
  const serverNext =
    typeof json.order_status === "string" && json.order_status.trim()
      ? json.order_status.trim()
      : order_status;
  return { ok: true, order_status: serverNext };
}

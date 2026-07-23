/**
 * StoreOrder BootstrapPort — store_order only.
 */
import { buildStoreOrderListSnapshot } from "@/lib/messenger/store-order/list";
import { STORE_ORDER_DOMAIN, type StoreOrderListItem, type StoreOrderRoomInput } from "@/lib/messenger/store-order/types";

export type StoreOrderBootstrapMode = "full" | "partial";

export type StoreOrderBootstrapSnapshot = Readonly<{
  domain: typeof STORE_ORDER_DOMAIN;
  viewerUserId: string;
  generation: string;
  mode: StoreOrderBootstrapMode;
  rows: ReadonlyArray<StoreOrderListItem>;
}>;

export type StoreOrderBootstrapResult =
  | { ok: true; snapshot: StoreOrderBootstrapSnapshot }
  | { ok: false; error: string };

export function acceptStoreOrderBootstrap(input: {
  viewerUserId: string;
  generation: string;
  mode: StoreOrderBootstrapMode;
  rooms: ReadonlyArray<StoreOrderRoomInput>;
}): StoreOrderBootstrapResult {
  const listed = buildStoreOrderListSnapshot({
    viewerUserId: input.viewerUserId,
    generation: input.generation,
    rooms: input.rooms,
  });
  if (!listed.ok) return listed;
  return {
    ok: true,
    snapshot: {
      domain: STORE_ORDER_DOMAIN,
      viewerUserId: listed.snapshot.viewerUserId,
      generation: listed.snapshot.generation,
      mode: input.mode,
      rows: listed.snapshot.rows,
    },
  };
}

export function mergeStoreOrderPartialBootstrap(
  previous: StoreOrderBootstrapSnapshot,
  patch: { generation: string; rooms: ReadonlyArray<StoreOrderRoomInput> }
): StoreOrderBootstrapResult {
  if (previous.domain !== STORE_ORDER_DOMAIN) {
    return { ok: false, error: "dibay_store_order_bootstrap_domain_mismatch" };
  }
  const accepted = acceptStoreOrderBootstrap({
    viewerUserId: previous.viewerUserId,
    generation: patch.generation,
    mode: "partial",
    rooms: patch.rooms,
  });
  if (!accepted.ok) return accepted;
  const byId = new Map(previous.rows.map((r) => [r.roomId, r]));
  for (const row of accepted.snapshot.rows) {
    byId.set(row.roomId, { ...row, generation: patch.generation });
  }
  return {
    ok: true,
    snapshot: {
      domain: STORE_ORDER_DOMAIN,
      viewerUserId: previous.viewerUserId,
      generation: patch.generation,
      mode: "partial",
      rows: [...byId.values()],
    },
  };
}

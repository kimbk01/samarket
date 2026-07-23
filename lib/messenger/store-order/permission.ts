/**
 * StoreOrder PermissionPort — 서버 권위 계약 (route/RLS 변경 없음).
 * 주문 참여자(고객·매장 측 역할)만. 친구 관계로 접근 금지.
 */
import type { MessengerPermissionPort } from "@/lib/messenger/contracts/ports";
import { assertStoreOrderOwnedRoom, parseStoreOrderIdentityKey } from "@/lib/messenger/store-order/identity";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";

export type StoreOrderPermissionContext = Readonly<{
  viewerUserId: string;
  room: {
    roomId: string;
    chatDomain: string | null | undefined;
    domainIdentityKey: string | null | undefined;
    orderId: string;
    customerUserId: string;
    storeOwnerUserIds: ReadonlyArray<string>;
    participantUserIds: ReadonlyArray<string>;
  };
}>;

export function assertStoreOrderViewerPermission(ctx: StoreOrderPermissionContext): void {
  const viewer = ctx.viewerUserId.trim();
  if (!viewer) throw new Error("dibay_store_order_viewer_required");
  assertStoreOrderOwnedRoom({
    roomId: ctx.room.roomId,
    chatDomain: (ctx.room.chatDomain ?? "") as "store_order",
    domainIdentityKey: ctx.room.domainIdentityKey ?? "",
  });
  const { orderId } = parseStoreOrderIdentityKey(ctx.room.domainIdentityKey ?? "");
  if (orderId !== ctx.room.orderId.trim()) {
    throw new Error("dibay_store_order_permission_order_mismatch");
  }
  const participants = ctx.room.participantUserIds.map((id) => id.trim()).filter(Boolean);
  if (!participants.includes(viewer)) {
    throw new Error("dibay_store_order_viewer_not_participant");
  }
  const owners = ctx.room.storeOwnerUserIds.map((id) => id.trim()).filter(Boolean);
  const customer = ctx.room.customerUserId.trim();
  if (viewer !== customer && !owners.includes(viewer)) {
    throw new Error("dibay_store_order_viewer_not_order_party");
  }
}

export type StoreOrderListApiPlan = Readonly<{
  method: "GET";
  proposedPath: "/api/messenger/store-order/list";
  response: { domain: typeof STORE_ORDER_DOMAIN; generation: string; rows: "StoreOrderListItem[]" };
  serverFilters: ReadonlyArray<string>;
}>;

export const STORE_ORDER_LIST_API_PLAN: StoreOrderListApiPlan = {
  method: "GET",
  proposedPath: "/api/messenger/store-order/list",
  response: { domain: STORE_ORDER_DOMAIN, generation: "string", rows: "StoreOrderListItem[]" },
  serverFilters: [
    "chat_domain = store_order",
    "viewer is order customer or store owner role participant",
    "reject other domains",
  ],
};

export const storeOrderPermissionPort: MessengerPermissionPort = {
  domain: STORE_ORDER_DOMAIN,
  serverAuthoritative: true,
};

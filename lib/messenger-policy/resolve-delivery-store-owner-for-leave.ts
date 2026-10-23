/**
 * L-7 — 주문·배달 방 leave 시 매장 사장님 판정 (stores.owner_user_id).
 * room.owner_user_id 단독 사용 금지.
 */

export type DeliveryStoreOwnerLeaveLookup = {
  isDeliveryRoom: boolean;
  storeOrderId: string | null;
  storeId: string | null;
};

export function parseDeliveryLeaveLookupFromRoom(input: {
  contextMetaKind?: string | null;
  storeOrderId?: string | null;
  storeId?: string | null;
  directKey?: string | null;
}): DeliveryStoreOwnerLeaveLookup {
  const kind = typeof input.contextMetaKind === "string" ? input.contextMetaKind.trim() : "";
  const dk = typeof input.directKey === "string" ? input.directKey.trim() : "";
  const fromDk =
    dk.startsWith("store_order:") || dk.startsWith("trade_order:")
      ? dk.replace(/^(store_order|trade_order):/, "").split(":")[0]?.trim() || null
      : null;
  const storeOrderId =
    (typeof input.storeOrderId === "string" ? input.storeOrderId.trim() : "") || fromDk || null;
  const isDeliveryRoom = kind === "delivery" || Boolean(fromDk);
  const storeId = typeof input.storeId === "string" && input.storeId.trim() ? input.storeId.trim() : null;
  return { isDeliveryRoom, storeOrderId: storeOrderId || null, storeId };
}

/** 조회 결과로 사장님이면 leave 거부 코드 */
export function resolveStoreOwnerCannotLeaveError(input: {
  viewerUserId: string;
  storeOwnerUserId: string | null | undefined;
}): "store_owner_cannot_leave" | null {
  const viewer = input.viewerUserId.trim();
  const owner = typeof input.storeOwnerUserId === "string" ? input.storeOwnerUserId.trim() : "";
  if (!viewer || !owner) return null;
  return viewer === owner ? "store_owner_cannot_leave" : null;
}

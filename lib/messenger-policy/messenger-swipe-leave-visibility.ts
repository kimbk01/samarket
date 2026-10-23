/**
 * 목록 스와이프「나가기」노출 — L-6 그룹 방장 · L-7 주문 매장 사장님.
 * 사장님 판정은 `stores.owner_user_id`(meta.storeOwnerUserId) 기준 — room.owner_user_id 단독 금지.
 */

export function isViewerGroupRoomOwner(input: {
  policyType: "trade" | "direct" | "group";
  viewerUserId: string | null | undefined;
  roomOwnerUserId: string | null | undefined;
}): boolean {
  if (input.policyType !== "group") return false;
  const viewer = typeof input.viewerUserId === "string" ? input.viewerUserId.trim() : "";
  const owner = typeof input.roomOwnerUserId === "string" ? input.roomOwnerUserId.trim() : "";
  return Boolean(viewer && owner && viewer === owner);
}

export function isViewerDeliveryStoreOwner(input: {
  isDeliveryRoom: boolean;
  viewerUserId: string | null | undefined;
  /** `stores.owner_user_id` — NOT `community_messenger_rooms.owner_user_id` */
  storeOwnerUserId: string | null | undefined;
}): boolean {
  if (!input.isDeliveryRoom) return false;
  const viewer = typeof input.viewerUserId === "string" ? input.viewerUserId.trim() : "";
  const storeOwner = typeof input.storeOwnerUserId === "string" ? input.storeOwnerUserId.trim() : "";
  return Boolean(viewer && storeOwner && viewer === storeOwner);
}

export function shouldOmitSwipeLeaveAction(input: {
  viewerIsGroupOwner: boolean;
  viewerIsDeliveryStoreOwner: boolean;
}): boolean {
  return Boolean(input.viewerIsGroupOwner || input.viewerIsDeliveryStoreOwner);
}

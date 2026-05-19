import type { StoreOrderRoomSnapshot } from "@/lib/store-order-chat/use-store-order-room-snapshot";

/**
 * 메신저 배달 주문 방 헤더 — 오너(매장) vs 구매자 표시 분기.
 * 스냅샷 로드 전후로 서로 다른 헤더가 깜빡이지 않도록 단일 규칙.
 */
export type StoreOrderDeliveryHeaderMode =
  | "owner_buyer_peer"
  | "buyer_store"
  | "generic_delivery"
  | "none";

export function resolveStoreOrderDeliveryHeaderMode(input: {
  isDeliveryRoom: boolean;
  myRole: "owner" | "admin" | "member";
  storeOrderSnap: StoreOrderRoomSnapshot | null;
}): StoreOrderDeliveryHeaderMode {
  if (!input.isDeliveryRoom) return "none";
  if (input.storeOrderSnap?.ownerOrder) return "owner_buyer_peer";
  if (input.storeOrderSnap?.buyerOrder) return "buyer_store";
  if (input.myRole === "owner") return "owner_buyer_peer";
  if (input.myRole === "member") return "buyer_store";
  return "generic_delivery";
}

/** store order 방 `title` 은 종종 「매장명 · 상품」 — 주문자 닉네임 폴백으로 쓰지 않음 */
export function buyerNicknameForOwnerHeader(
  peerProfileLabel: string | null | undefined,
  roomTitle: string | null | undefined
): string {
  const fromPeer = peerProfileLabel?.trim();
  if (fromPeer) return fromPeer;
  const title = roomTitle?.trim() ?? "";
  if (title.length > 0 && !title.includes(" · ")) return title;
  return "주문자";
}

export function resolveDeliveryPeerUserId(input: {
  peerUserId: string;
  viewerUserId: string;
  memberIds: string[];
}): string {
  const peer = input.peerUserId.trim();
  if (peer && peer !== input.viewerUserId.trim()) return peer;
  const viewer = input.viewerUserId.trim();
  for (const id of input.memberIds) {
    const uid = id.trim();
    if (uid && uid !== viewer) return uid;
  }
  return peer;
}

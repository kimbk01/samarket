/**
 * store_order Domain — 고객 Surface 계약 (Phase 1).
 * 상대 = 매장. peer user / room.title / @username fallback 금지.
 */
import type { DomainDisplayIdentity, DomainOwnedRoomRef } from "@/lib/messenger/contracts/ports";

export type StoreOrderCustomerSurface = Readonly<{
  kind: "buyer_store";
  storeId: string | null;
  storeName: string;
  storeImageUrl: string | null;
}>;

/**
 * Phase 1: 계약 가드. peerFallback 필드가 입력에 있으면 fail-closed.
 * (실제 enrich 는 Phase 4 store_order Domain 구현)
 */
export function assertStoreOrderCustomerDisplayIdentity(input: {
  room: DomainOwnedRoomRef;
  storeName: string;
  storeImageUrl: string | null;
  /** 금지 — 존재하면 throw */
  peerUserName?: string | null;
  peerAvatarUrl?: string | null;
  roomTitleFallback?: string | null;
}): DomainDisplayIdentity {
  if (input.room.chatDomain !== "store_order") {
    throw new Error("dibay_store_order_customer_domain_required");
  }
  if (input.peerUserName?.trim() || input.peerAvatarUrl?.trim() || input.roomTitleFallback?.trim()) {
    throw new Error("dibay_store_order_customer_peer_fallback_forbidden");
  }
  const name = input.storeName.trim() || "매장";
  return {
    title: name,
    avatarUrl: input.storeImageUrl?.trim() || null,
    usedPeerUserFallback: false,
  };
}

export function toStoreOrderCustomerSurface(identity: DomainDisplayIdentity): StoreOrderCustomerSurface {
  return {
    kind: "buyer_store",
    storeId: null,
    storeName: identity.title,
    storeImageUrl: identity.avatarUrl,
  };
}

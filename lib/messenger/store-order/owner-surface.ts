/**
 * store_order Domain — 오너 Surface 계약 (Phase 1).
 * 오너 관리자 주문 영역 · 상대 = 해당 주문 고객.
 * 고객 Surface 와 동일 resolver 혼용 금지.
 */
import type { DomainDisplayIdentity, DomainOwnedRoomRef } from "@/lib/messenger/contracts/ports";

export type StoreOrderOwnerSurface = Readonly<{
  kind: "owner_buyer_peer";
  customerUserId: string | null;
  customerName: string;
  customerAvatarUrl: string | null;
  storeId: string | null;
}>;

export function assertStoreOrderOwnerDisplayIdentity(input: {
  room: DomainOwnedRoomRef;
  customerName: string;
  customerAvatarUrl: string | null;
  customerUserId?: string | null;
  storeId?: string | null;
  /** 금지 — 매장명으로 오너 헤더 대체 */
  storeNameAsTitle?: string | null;
}): DomainDisplayIdentity {
  if (input.room.chatDomain !== "store_order") {
    throw new Error("dibay_store_order_owner_domain_required");
  }
  if (input.storeNameAsTitle?.trim()) {
    throw new Error("dibay_store_order_owner_store_title_forbidden");
  }
  return {
    title: input.customerName.trim() || "주문자",
    avatarUrl: input.customerAvatarUrl?.trim() || null,
    usedPeerUserFallback: false,
  };
}

export function toStoreOrderOwnerSurface(
  identity: DomainDisplayIdentity,
  meta: { customerUserId?: string | null; storeId?: string | null }
): StoreOrderOwnerSurface {
  return {
    kind: "owner_buyer_peer",
    customerUserId: meta.customerUserId ?? null,
    customerName: identity.title,
    customerAvatarUrl: identity.avatarUrl,
    storeId: meta.storeId ?? null,
  };
}

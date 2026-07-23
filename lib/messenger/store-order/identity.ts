/**
 * store_order IdentityPort — store_order:{orderId} 만.
 */
import {
  assertDomainRoomIdentity,
  requireDomainIdentityKey,
  storeOrderRoomIdentity,
  type DomainRoomIdentity,
} from "@/lib/chat-domain/room-identity";
import type { DomainOwnedRoomRef, MessengerIdentityPort } from "@/lib/messenger/contracts/ports";
import {
  assertStoreOrderIdentityKey,
  buildStoreOrderIdentityKey,
  STORE_ORDER_DOMAIN,
} from "@/lib/messenger/store-order/design-lock";

export function buildStoreOrderIdentity(orderId: string): DomainRoomIdentity {
  return assertDomainRoomIdentity(STORE_ORDER_DOMAIN, storeOrderRoomIdentity(orderId));
}

export function parseStoreOrderIdentityKey(identityKey: string): { orderId: string } {
  return assertStoreOrderIdentityKey(requireDomainIdentityKey(identityKey));
}

export function assertStoreOrderOwnedRoom(room: DomainOwnedRoomRef): DomainOwnedRoomRef {
  if (room.chatDomain !== STORE_ORDER_DOMAIN) {
    throw new Error(`dibay_store_order_domain_required:${room.chatDomain}`);
  }
  parseStoreOrderIdentityKey(room.domainIdentityKey);
  if (!room.roomId.trim()) throw new Error("dibay_store_order_room_id_required");
  return room;
}

export function assertStoreOrderIdentityMatchesOrderId(identityKey: string, orderId: string): void {
  const expected = buildStoreOrderIdentityKey(orderId);
  if (identityKey.trim() !== expected) {
    throw new Error("dibay_store_order_identity_order_mismatch");
  }
}

export const storeOrderIdentityPort: MessengerIdentityPort = {
  domain: STORE_ORDER_DOMAIN,
  assertMatches: assertStoreOrderOwnedRoom,
  build: ((orderId: string) => buildStoreOrderIdentity(orderId)) as MessengerIdentityPort["build"],
};

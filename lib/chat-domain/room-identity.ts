import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type DomainRoomIdentity = {
  domain: ChatDomain;
  identityKey: string;
};

function requiredPart(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`dibay_room_identity_${field}_required`);
  return normalized;
}

export function requireDomainIdentityKey(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("dibay_room_identity_required");
  }
  return value.trim();
}

function sortedPair(userA: string, userB: string): [string, string] {
  const a = requiredPart(userA, "user_a");
  const b = requiredPart(userB, "user_b");
  if (a === b) throw new Error("dibay_room_identity_distinct_users_required");
  return [a, b].sort() as [string, string];
}

export function generalDirectRoomIdentity(userA: string, userB: string): DomainRoomIdentity {
  const [a, b] = sortedPair(userA, userB);
  return { domain: "general_direct", identityKey: `general_direct:${a}:${b}` };
}

export function groupRoomIdentity(roomId: string): DomainRoomIdentity {
  return { domain: "group", identityKey: `group:${requiredPart(roomId, "room_id")}` };
}

export function tradeRoomIdentity(input: {
  itemId: string;
  sellerId: string;
  buyerId: string;
}): DomainRoomIdentity {
  return {
    domain: "trade",
    identityKey: [
      "trade",
      requiredPart(input.itemId, "item_id"),
      requiredPart(input.sellerId, "seller_id"),
      requiredPart(input.buyerId, "buyer_id"),
    ].join(":"),
  };
}

export function storeOrderRoomIdentity(orderId: string): DomainRoomIdentity {
  return {
    domain: "store_order",
    identityKey: `store_order:${requiredPart(orderId, "order_id")}`,
  };
}

export function assertDomainRoomIdentity(
  expectedDomain: ChatDomain,
  identity: DomainRoomIdentity
): DomainRoomIdentity {
  if (identity.domain !== expectedDomain || !identity.identityKey.trim()) {
    throw new Error("dibay_room_identity_domain_mismatch");
  }
  return identity;
}

/**
 * trade IdentityPort — trade:{itemId}:{sellerId}:{counterpartyId}
 * user-pair / general_direct identity 금지. roomType/direct_key 재추론 금지.
 */
import {
  assertDomainRoomIdentity,
  requireDomainIdentityKey,
  tradeRoomIdentity,
  type DomainRoomIdentity,
} from "@/lib/chat-domain/room-identity";
import type { DomainOwnedRoomRef, MessengerIdentityPort } from "@/lib/messenger/contracts/ports";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";

const IDENTITY_RE = /^trade:([^:]+):([^:]+):([^:]+)$/;

export function buildTradeIdentity(input: {
  itemId: string;
  sellerUserId: string;
  counterpartyUserId: string;
}): DomainRoomIdentity {
  return assertDomainRoomIdentity(
    TRADE_DOMAIN,
    tradeRoomIdentity({
      itemId: input.itemId,
      sellerId: input.sellerUserId,
      buyerId: input.counterpartyUserId,
    })
  );
}

export function parseTradeIdentityKey(identityKey: string): {
  itemId: string;
  sellerUserId: string;
  counterpartyUserId: string;
} {
  const key = requireDomainIdentityKey(identityKey);
  if (key.startsWith("general_direct:")) {
    throw new Error("dibay_trade_general_direct_identity_forbidden");
  }
  if (key.startsWith("group:") || key.startsWith("store_order:")) {
    throw new Error("dibay_trade_foreign_identity_forbidden");
  }
  /** Backfill `trade:legacy:…` matches the 3-part regex but is not a listing triple. */
  if (key.startsWith("trade:legacy:") || key === "trade:legacy") {
    throw new Error("dibay_trade_legacy_identity_forbidden");
  }
  const m = IDENTITY_RE.exec(key);
  if (!m) throw new Error("dibay_trade_identity_prefix_mismatch");
  const itemId = m[1]!.trim();
  const sellerUserId = m[2]!.trim();
  const counterpartyUserId = m[3]!.trim();
  if (!itemId || !sellerUserId || !counterpartyUserId) {
    throw new Error("dibay_trade_identity_parts_required");
  }
  if (itemId === "legacy") {
    throw new Error("dibay_trade_legacy_identity_forbidden");
  }
  if (sellerUserId === counterpartyUserId) {
    throw new Error("dibay_trade_identity_distinct_parties_required");
  }
  const rebuilt = buildTradeIdentity({
    itemId,
    sellerUserId,
    counterpartyUserId,
  }).identityKey;
  if (rebuilt !== key) {
    throw new Error("dibay_trade_identity_canonical_mismatch");
  }
  return { itemId, sellerUserId, counterpartyUserId };
}

export function assertTradeOwnedRoom(room: DomainOwnedRoomRef): DomainOwnedRoomRef {
  if (room.chatDomain !== TRADE_DOMAIN) {
    throw new Error(`dibay_trade_domain_required:${room.chatDomain}`);
  }
  parseTradeIdentityKey(room.domainIdentityKey);
  if (!room.roomId.trim()) throw new Error("dibay_trade_room_id_required");
  return room;
}

export function assertTradeIdentityMatchesParts(
  identityKey: string,
  parts: { itemId: string; sellerUserId: string; counterpartyUserId: string }
): void {
  const parsed = parseTradeIdentityKey(identityKey);
  const expected = buildTradeIdentity(parts).identityKey;
  if (parsed.itemId !== parts.itemId.trim() || identityKey !== expected) {
    throw new Error("dibay_trade_identity_parts_mismatch");
  }
}

export const tradeIdentityPort: MessengerIdentityPort = {
  domain: TRADE_DOMAIN,
  assertMatches: assertTradeOwnedRoom,
  build: ((itemId: string, sellerUserId: string, counterpartyUserId: string) =>
    buildTradeIdentity({ itemId, sellerUserId, counterpartyUserId })) as MessengerIdentityPort["build"],
};

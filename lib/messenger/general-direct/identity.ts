/**
 * general_direct IdentityPort 구현.
 * Identity: general_direct:{sortedUserA}:{sortedUserB}
 * roomType/direct_key/title 재추론 금지.
 */
import {
  assertDomainRoomIdentity,
  generalDirectRoomIdentity,
  requireDomainIdentityKey,
  type DomainRoomIdentity,
} from "@/lib/chat-domain/room-identity";
import type { DomainOwnedRoomRef, MessengerIdentityPort } from "@/lib/messenger/contracts/ports";
import { GENERAL_DIRECT_DOMAIN } from "@/lib/messenger/general-direct/types";

const IDENTITY_RE = /^general_direct:([^:]+):([^:]+)$/;

export function buildGeneralDirectIdentity(userA: string, userB: string): DomainRoomIdentity {
  return assertDomainRoomIdentity(GENERAL_DIRECT_DOMAIN, generalDirectRoomIdentity(userA, userB));
}

export function parseGeneralDirectIdentityKey(identityKey: string): { userA: string; userB: string } {
  const key = requireDomainIdentityKey(identityKey);
  const m = IDENTITY_RE.exec(key);
  if (!m) throw new Error("dibay_general_direct_identity_prefix_mismatch");
  const userA = m[1]!.trim();
  const userB = m[2]!.trim();
  if (!userA || !userB || userA === userB) {
    throw new Error("dibay_general_direct_identity_invalid_pair");
  }
  // canonical order already sorted at build time
  if (userA > userB) throw new Error("dibay_general_direct_identity_not_sorted");
  return { userA, userB };
}

export function assertGeneralDirectOwnedRoom(room: DomainOwnedRoomRef): DomainOwnedRoomRef {
  if (room.chatDomain !== GENERAL_DIRECT_DOMAIN) {
    throw new Error(`dibay_general_direct_domain_required:${room.chatDomain}`);
  }
  const key = requireDomainIdentityKey(room.domainIdentityKey);
  if (!key.startsWith("general_direct:")) {
    throw new Error("dibay_general_direct_identity_prefix_mismatch");
  }
  if (key.startsWith("trade:") || key.startsWith("store_order:") || key.startsWith("group:")) {
    throw new Error("dibay_general_direct_foreign_identity_forbidden");
  }
  parseGeneralDirectIdentityKey(key);
  if (!room.roomId.trim()) throw new Error("dibay_general_direct_room_id_required");
  return room;
}

export function assertNotForeignDomainIdentity(identityKey: string): void {
  const key = requireDomainIdentityKey(identityKey);
  if (
    key.startsWith("trade:") ||
    key.startsWith("store_order:") ||
    key.startsWith("group:") ||
    !key.startsWith("general_direct:")
  ) {
    throw new Error("dibay_general_direct_foreign_identity_forbidden");
  }
  parseGeneralDirectIdentityKey(key);
}

export const generalDirectIdentityPort: MessengerIdentityPort = {
  domain: GENERAL_DIRECT_DOMAIN,
  assertMatches: assertGeneralDirectOwnedRoom,
  build: ((userA: string, userB: string) => buildGeneralDirectIdentity(userA, userB)) as MessengerIdentityPort["build"],
};

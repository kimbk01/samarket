/**
 * group IdentityPort — group:{groupId} 만. 참가자 pair Identity 금지.
 */
import {
  assertDomainRoomIdentity,
  groupRoomIdentity,
  requireDomainIdentityKey,
  type DomainRoomIdentity,
} from "@/lib/chat-domain/room-identity";
import type { DomainOwnedRoomRef, MessengerIdentityPort } from "@/lib/messenger/contracts/ports";
import { GROUP_DOMAIN } from "@/lib/messenger/group/domain";

const IDENTITY_RE = /^group:([^:]+)$/;

export function buildGroupIdentity(groupId: string): DomainRoomIdentity {
  return assertDomainRoomIdentity(GROUP_DOMAIN, groupRoomIdentity(groupId));
}

export function parseGroupIdentityKey(identityKey: string): { groupId: string } {
  const key = requireDomainIdentityKey(identityKey);
  if (
    key.startsWith("general_direct:") ||
    key.startsWith("trade:") ||
    key.startsWith("store_order:")
  ) {
    throw new Error("dibay_group_foreign_identity_forbidden");
  }
  const m = IDENTITY_RE.exec(key);
  if (!m) throw new Error("dibay_group_identity_prefix_mismatch");
  const groupId = m[1]!.trim();
  if (!groupId) throw new Error("dibay_group_group_id_required");
  return { groupId };
}

export function assertGroupOwnedRoom(room: DomainOwnedRoomRef): DomainOwnedRoomRef {
  if (room.chatDomain !== GROUP_DOMAIN) {
    throw new Error(`dibay_group_domain_required:${room.chatDomain}`);
  }
  parseGroupIdentityKey(room.domainIdentityKey);
  if (!room.roomId.trim()) throw new Error("dibay_group_room_id_required");
  return room;
}

export function assertGroupIdentityMatchesGroupId(identityKey: string, groupId: string): void {
  const expected = buildGroupIdentity(groupId).identityKey;
  if (identityKey.trim() !== expected) {
    throw new Error("dibay_group_identity_group_mismatch");
  }
}

export const groupIdentityPort: MessengerIdentityPort = {
  domain: GROUP_DOMAIN,
  assertMatches: assertGroupOwnedRoom,
  build: ((groupId: string) => buildGroupIdentity(groupId)) as MessengerIdentityPort["build"],
};

/**
 * Attach / extract DomainRoomReadVersion from CM room snapshots.
 */

import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  deriveRoomReadVersionMs,
  type DomainRoomReadVersion,
  type RoomReadSource,
} from "@/lib/chat-domain/room-read/domain-room-read-version";

export function roomReadVersionFromSnapshot(
  snap: CommunityMessengerRoomSnapshot,
  fallbackSource: RoomReadSource = "unknown",
): DomainRoomReadVersion {
  const roomId = String(snap.room?.id ?? "").trim();
  const messageCreatedAts = (snap.messages ?? []).map((m) => m.createdAt);
  const versionMs = deriveRoomReadVersionMs({
    lastMessageAt: snap.room?.lastMessageAt,
    messageCreatedAts,
    explicitVersionMs: snap.readVersionMs,
  });
  return {
    roomId,
    versionMs,
    source: snap.readVersionSource ?? fallbackSource,
    chatDomain: snap.room?.chatDomain ?? null,
    domainIdentity: snap.room?.domainIdentity ?? null,
  };
}

/** Ensure snapshot carries readVersionMs (derived if absent). Does not mutate input. */
export function withRoomReadVersion(
  snap: CommunityMessengerRoomSnapshot,
  source: RoomReadSource,
): CommunityMessengerRoomSnapshot {
  const version = roomReadVersionFromSnapshot(snap, source);
  return {
    ...snap,
    readVersionMs: version.versionMs,
    readVersionSource: snap.readVersionSource ?? source,
  };
}

export {
  compareRoomReadVersions,
  deriveRoomReadVersionMs,
  roomReadSourceRank,
  shouldAcceptIncomingRoomRead,
  versionMsFromIso,
  type DomainRoomReadVersion,
  type RoomReadSource,
} from "@/lib/chat-domain/room-read/domain-room-read-version";

export {
  applyAtomicRoomRead,
  type AtomicRoomReadResult,
} from "@/lib/chat-domain/room-read/atomic-room-read";

export {
  roomReadVersionFromSnapshot,
  withRoomReadVersion,
} from "@/lib/chat-domain/room-read/attach-room-read-version";

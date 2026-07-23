/**
 * Phase F — atomic room read apply helper.
 * docs/community-messenger/2026-07-23-four-domain-phase-f.md
 */

import {
  shouldAcceptIncomingRoomRead,
  type DomainRoomReadVersion,
} from "@/lib/chat-domain/room-read/domain-room-read-version";

export type AtomicRoomReadResult<T> = {
  accepted: boolean;
  /** Snapshot (or payload) to keep after compare. */
  value: T;
  reason: "accepted" | "rejected_stale" | "accepted_initial";
  prevVersion: DomainRoomReadVersion | null;
  incomingVersion: DomainRoomReadVersion;
};

export function applyAtomicRoomRead<T>(args: {
  prevValue: T | null | undefined;
  prevVersion: DomainRoomReadVersion | null | undefined;
  incomingValue: T;
  incomingVersion: DomainRoomReadVersion;
}): AtomicRoomReadResult<T> {
  const prevVersion = args.prevVersion ?? null;
  if (!prevVersion || !args.prevValue) {
    return {
      accepted: true,
      value: args.incomingValue,
      reason: "accepted_initial",
      prevVersion: null,
      incomingVersion: args.incomingVersion,
    };
  }
  if (!shouldAcceptIncomingRoomRead(prevVersion, args.incomingVersion)) {
    return {
      accepted: false,
      value: args.prevValue,
      reason: "rejected_stale",
      prevVersion,
      incomingVersion: args.incomingVersion,
    };
  }
  return {
    accepted: true,
    value: args.incomingValue,
    reason: "accepted",
    prevVersion,
    incomingVersion: args.incomingVersion,
  };
}

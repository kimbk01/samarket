import { describe, expect, it } from "vitest";
import {
  filterDirectCallHistoryForPeer,
  groupCallPeerHistoryByDate,
} from "@/lib/community-messenger/call-history/call-peer-history-group";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

function makeCall(overrides: Partial<CommunityMessengerCallLog>): CommunityMessengerCallLog {
  return {
    id: "c1",
    sessionId: "s1",
    roomId: "r1",
    sessionMode: "direct",
    title: "Call",
    peerLabel: "Peer",
    peerPublicId: "peer_id",
    peerAvatarUrl: null,
    peerUserId: "peer-1",
    participantCount: 2,
    participantLabels: [],
    callKind: "voice",
    status: "ended",
    startedAt: "2026-06-17T10:00:00.000Z",
    durationSeconds: 60,
    endedAt: "2026-06-17T10:01:00.000Z",
    isOutgoing: true,
    endedReason: null,
    displayType: "outgoing",
    ...overrides,
  };
}

describe("call-peer-history-group", () => {
  it("filters direct peer calls only", () => {
    const calls = [
      makeCall({ id: "a", peerUserId: "peer-1" }),
      makeCall({ id: "b", peerUserId: "peer-2" }),
      makeCall({ id: "c", peerUserId: "peer-1", sessionMode: "group" }),
    ];
    expect(filterDirectCallHistoryForPeer(calls, "peer-1").map((c) => c.id)).toEqual(["a"]);
  });

  it("groups calls by calendar day", () => {
    const calls = [
      makeCall({ id: "a", endedAt: "2026-06-17T10:01:00.000Z" }),
      makeCall({ id: "b", endedAt: "2026-06-16T10:01:00.000Z" }),
    ];
    const sections = groupCallPeerHistoryByDate(calls);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.calls.map((c) => c.id)).toEqual(["a"]);
    expect(sections[1]?.calls.map((c) => c.id)).toEqual(["b"]);
  });
});

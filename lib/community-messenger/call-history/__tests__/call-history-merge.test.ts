import { describe, expect, it } from "vitest";
import { mergeCallHistoryForHomeList } from "@/lib/community-messenger/call-history/call-history-merge";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

function call(partial: Partial<CommunityMessengerCallLog> & { id: string }): CommunityMessengerCallLog {
  return {
    sessionId: null,
    roomId: null,
    sessionMode: "direct",
    title: "Call",
    peerLabel: "Peer",
    peerAvatarUrl: null,
    peerUserId: "peer",
    participantCount: 2,
    participantLabels: [],
    callKind: "voice",
    status: "ended",
    startedAt: "2026-06-01T00:00:00.000Z",
    durationSeconds: 60,
    endedAt: "2026-06-01T00:00:00.000Z",
    isOutgoing: true,
    endedReason: null,
    displayType: "outgoing",
    ...partial,
  };
}

describe("call-history-merge", () => {
  it("keeps all direct calls but one per group room", () => {
    const merged = mergeCallHistoryForHomeList([
      call({ id: "d1", startedAt: "2026-06-01T00:00:00.000Z" }),
      call({ id: "d2", startedAt: "2026-06-02T00:00:00.000Z" }),
      call({
        id: "g1",
        sessionMode: "group",
        roomId: "room-a",
        startedAt: "2026-06-03T00:00:00.000Z",
      }),
      call({
        id: "g2",
        sessionMode: "group",
        roomId: "room-a",
        startedAt: "2026-06-04T00:00:00.000Z",
      }),
    ]);
    expect(merged.map((c) => c.id).sort()).toEqual(["d1", "d2", "g2"]);
  });
});

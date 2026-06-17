import { describe, expect, it } from "vitest";
import { sortCallHistoryEntries } from "@/lib/community-messenger/call-history/call-history-sorter";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

function call(id: string, startedAt: string): CommunityMessengerCallLog {
  return {
    id,
    sessionId: null,
    roomId: null,
    sessionMode: "direct",
    title: "Call",
    peerLabel: "Peer",
    peerAvatarUrl: null,
    peerUserId: null,
    participantCount: 2,
    participantLabels: [],
    callKind: "voice",
    status: "ended",
    startedAt,
    durationSeconds: 60,
    endedAt: startedAt,
    isOutgoing: true,
    endedReason: null,
    displayType: "outgoing",
  };
}

describe("call-history-sorter", () => {
  it("sorts by startedAt desc", () => {
    const sorted = sortCallHistoryEntries([
      call("a", "2026-06-01T00:00:00.000Z"),
      call("b", "2026-06-10T00:00:00.000Z"),
    ]);
    expect(sorted[0]?.id).toBe("b");
  });
});

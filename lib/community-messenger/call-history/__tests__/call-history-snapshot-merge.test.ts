import { describe, expect, it, beforeEach } from "vitest";
import {
  beginCallHistoryFetchSequence,
  clearCallHistorySnapshotMergeStateForTests,
  commitCallHistoryFetchSequence,
  mergeCallHistoryLists,
  shouldApplyCallHistoryFetchSequence,
} from "@/lib/community-messenger/call-history/call-history-snapshot-merge";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

function call(
  partial: Partial<CommunityMessengerCallLog> & { id: string; startedAt: string }
): CommunityMessengerCallLog {
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
    durationSeconds: 60,
    endedAt: partial.startedAt,
    isOutgoing: true,
    endedReason: null,
    displayType: "outgoing",
    ...partial,
  };
}

describe("call-history-snapshot-merge", () => {
  beforeEach(() => {
    clearCallHistorySnapshotMergeStateForTests();
  });

  it("keeps realtime-only row when old snapshot arrives without it", () => {
    const realtime = call({
      id: "rt-new",
      startedAt: "2026-06-05T12:00:00.000Z",
      displayType: "missed_incoming",
      status: "missed",
    });
    const staleSnapshot = [call({ id: "old-1", startedAt: "2026-06-04T12:00:00.000Z" })];

    const merged = mergeCallHistoryLists([realtime], staleSnapshot);
    expect(merged.list.map((row) => row.id)).toEqual(["rt-new", "old-1"]);
    expect(merged.prevOnlyRowsKept).toBe(1);
  });

  it("does not rollback newer row when stale snapshot has older timestamp for same id", () => {
    const prev = call({
      id: "c1",
      startedAt: "2026-06-05T12:00:00.000Z",
      status: "ended",
      displayType: "incoming",
      durationSeconds: 120,
    });
    const stale = call({
      id: "c1",
      startedAt: "2026-06-05T11:00:00.000Z",
      status: "missed",
      displayType: "missed_incoming",
      durationSeconds: 0,
    });

    const merged = mergeCallHistoryLists([prev], [stale]);
    expect(merged.list[0]?.status).toBe("ended");
    expect(merged.list[0]?.displayType).toBe("incoming");
    expect(merged.staleIncomingRowsDropped).toBe(1);
  });

  it("sorts merged list by timestamp desc", () => {
    const merged = mergeCallHistoryLists(
      [call({ id: "a", startedAt: "2026-06-01T00:00:00.000Z" })],
      [call({ id: "b", startedAt: "2026-06-03T00:00:00.000Z" })]
    );
    expect(merged.list.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("drops out-of-order fetch apply via monotonic sequence", () => {
    const slowSeq = beginCallHistoryFetchSequence();
    const fastSeq = beginCallHistoryFetchSequence();

    commitCallHistoryFetchSequence(fastSeq);
    expect(shouldApplyCallHistoryFetchSequence(fastSeq)).toBe(true);
    expect(shouldApplyCallHistoryFetchSequence(slowSeq)).toBe(false);
  });

  it("preserves missed/received/outgoing/cancelled labels on newer row", () => {
    const prev = call({
      id: "c-cancel",
      startedAt: "2026-06-05T12:00:00.000Z",
      status: "cancelled",
      displayType: "cancelled",
      isOutgoing: true,
    });
    const stale = call({
      id: "c-cancel",
      startedAt: "2026-06-05T11:00:00.000Z",
      status: "ended",
      displayType: "outgoing",
      isOutgoing: true,
    });
    const merged = mergeCallHistoryLists([prev], [stale]);
    expect(merged.list[0]?.displayType).toBe("cancelled");
    expect(merged.list[0]?.status).toBe("cancelled");
  });

  it("applies only the latest completed fetch in a repeated refetch race", () => {
    const prev = [call({ id: "keep", startedAt: "2026-06-05T12:00:00.000Z" })];

    const slowSeq = beginCallHistoryFetchSequence();
    const fastSeq = beginCallHistoryFetchSequence();

    const slowSnapshot = [call({ id: "keep", startedAt: "2026-06-04T12:00:00.000Z", status: "missed", displayType: "missed_incoming" })];
    const fastSnapshot = [
      call({ id: "keep", startedAt: "2026-06-05T12:00:00.000Z", status: "ended", displayType: "incoming" }),
      call({ id: "new", startedAt: "2026-06-05T13:00:00.000Z", status: "ended", displayType: "outgoing" }),
    ];

    commitCallHistoryFetchSequence(fastSeq);
    expect(shouldApplyCallHistoryFetchSequence(fastSeq)).toBe(true);
    const afterFast = mergeCallHistoryLists(prev, fastSnapshot).list;

    expect(shouldApplyCallHistoryFetchSequence(slowSeq)).toBe(false);
    const afterSlowBlocked = mergeCallHistoryLists(afterFast, slowSnapshot).list;

    expect(afterSlowBlocked.map((row) => row.id)).toEqual(["new", "keep"]);
    expect(afterSlowBlocked[1]?.displayType).toBe("incoming");
  });
});

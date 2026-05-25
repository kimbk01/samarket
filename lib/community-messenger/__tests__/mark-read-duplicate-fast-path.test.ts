import { describe, expect, it, beforeEach } from "vitest";
import {
  compareMarkReadCursorOrderFromCache,
  probeMarkReadEarlyDuplicateFastPath,
  rememberMarkReadMessageOrderFromRows,
  resetMarkReadDuplicateFastPathCachesForTests,
} from "@/lib/community-messenger/mark-read-duplicate-fast-path";
import {
  storeMarkReadParticipantSnapshotsFromRow,
  resetMarkReadParticipantSnapshotCachesForTests,
} from "@/lib/community-messenger/mark-read-participant-snapshot";

describe("mark-read-duplicate-fast-path", () => {
  const userId = "user-a";
  const roomId = "room-1";

  beforeEach(() => {
    resetMarkReadDuplicateFastPathCachesForTests();
    resetMarkReadParticipantSnapshotCachesForTests();
  });

  it("returns duplicate ack from memory snapshot without fetch", () => {
    storeMarkReadParticipantSnapshotsFromRow(
      userId,
      roomId,
      { flushOpen: true, requestedLastReadMessageId: "" },
      {
        id: "part-1",
        last_read_message_id: "msg-100",
        last_read_at: "2026-05-24T10:00:00.000Z",
        unread_count: 0,
      }
    );

    const diag: Record<string, unknown> = {};
    const result = probeMarkReadEarlyDuplicateFastPath({
      userId,
      roomId,
      requestedLastReadMessageId: "",
      flushOpen: true,
      membershipCacheHit: 1,
      diag,
    });

    expect(result?.duplicateAckSkipped).toBe(true);
    expect(result?.lastReadMessageId).toBe("msg-100");
    expect(diag.duplicate_fast_path).toBe(1);
    expect(diag.fetch_existing_skipped).toBe(1);
  });

  it("uses cached message order for regression without DB", () => {
    rememberMarkReadMessageOrderFromRows(roomId, [
      { id: "msg-old", created_at: "2026-05-24T09:00:00.000Z" },
      { id: "msg-new", created_at: "2026-05-24T10:00:00.000Z" },
    ]);
    storeMarkReadParticipantSnapshotsFromRow(
      userId,
      roomId,
      { flushOpen: false, requestedLastReadMessageId: "msg-old" },
      {
        id: "part-1",
        last_read_message_id: "msg-new",
        last_read_at: "2026-05-24T10:00:00.000Z",
        unread_count: 0,
      }
    );

    const result = probeMarkReadEarlyDuplicateFastPath({
      userId,
      roomId,
      requestedLastReadMessageId: "msg-old",
      flushOpen: false,
      diag: {},
    });

    expect(result?.regressionBlocked).toBe(true);
    expect(result?.duplicateAckSkipped).toBe(true);
  });

  it("compareMarkReadCursorOrderFromCache resolves advance vs regression", () => {
    rememberMarkReadMessageOrderFromRows(roomId, [
      { id: "a", created_at: "2026-05-24T09:00:00.000Z" },
      { id: "b", created_at: "2026-05-24T10:00:00.000Z" },
    ]);
    expect(compareMarkReadCursorOrderFromCache(roomId, "a", "b")).toBe("advance");
    expect(compareMarkReadCursorOrderFromCache(roomId, "b", "a")).toBe("regression");
    expect(compareMarkReadCursorOrderFromCache(roomId, "a", "a")).toBe("same");
  });
});

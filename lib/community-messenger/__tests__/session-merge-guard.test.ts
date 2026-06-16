import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  canAcceptIncomingSessionId,
  filterSessionsRespectingTerminalLatch,
  shouldBlockRingingSessionMerge,
} from "@/lib/community-messenger/call-events/session-merge-guard";
import { latchCallTerminal } from "@/lib/community-messenger/call-state/call-terminal-tombstone";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

vi.mock("@/lib/community-messenger/call-orchestrator", () => ({
  logDibayCall: vi.fn(),
}));

function ringingSession(id: string): Pick<CommunityMessengerCallSession, "id" | "status"> {
  return { id, status: "ringing" };
}

describe("session-merge-guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks GET ringing merge after terminal latch (stale_ringing_blocked)", () => {
    const hard = new Map<string, number>();
    const callId = "merge-block-1";
    latchCallTerminal(callId, "ended", { hardClearedAt: hard });
    expect(
      shouldBlockRingingSessionMerge(ringingSession(callId), { hardClearedAt: hard }, Date.now(), "merge_fetch")
    ).toBe(true);
  });

  it("filterSessionsRespectingTerminalLatch drops tombstoned ringing row", () => {
    const hard = new Map<string, number>();
    const oldId = "merge-old-1";
    const newId = "merge-new-1";
    latchCallTerminal(oldId, "cancelled", { hardClearedAt: hard });
    const filtered = filterSessionsRespectingTerminalLatch(
      [ringingSession(oldId) as CommunityMessengerCallSession, ringingSession(newId) as CommunityMessengerCallSession],
      { hardClearedAt: hard }
    );
    expect(filtered.map((s) => s.id)).toEqual([newId]);
  });

  it("redial: new callId allowed, previous callId rejected", () => {
    const hard = new Map<string, number>();
    const oldId = "redial-old-1";
    const newId = "redial-new-1";
    latchCallTerminal(oldId, "ended", { hardClearedAt: hard });
    expect(canAcceptIncomingSessionId(newId, { hardClearedAt: hard })).toBe(true);
    expect(canAcceptIncomingSessionId(oldId, { hardClearedAt: hard })).toBe(false);
  });
});

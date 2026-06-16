import { describe, expect, it, vi } from "vitest";
import {
  dismissIncomingPresenterAfterAccept,
  markIncomingCallHardClearedSession,
} from "@/lib/community-messenger/incoming-call/accept-presenter-dismiss";

vi.mock("@/lib/community-messenger/call-lifecycle", () => ({
  dibayIncomingLaneStopRing: vi.fn(),
}));

import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";

describe("accept-presenter-dismiss", () => {
  it("marks dismissed, hard clear, active id removal, and suppress missed", () => {
    const dismissed = new Map<string, number>();
    const hard = new Map<string, number>();
    const active = new Set(["s1"]);
    const suppress = new Set<string>();
    const removed: string[] = [];

    dismissIncomingPresenterAfterAccept({
      sessionId: "s1",
      dismissedAt: dismissed,
      hardClearedAt: hard,
      activeIncomingCallIds: active,
      suppressMissedSound: suppress,
      removeSessionFromIncomingList: (id) => removed.push(id),
    });

    expect(dismissed.has("s1")).toBe(true);
    expect(hard.has("s1")).toBe(true);
    expect(active.has("s1")).toBe(false);
    expect(suppress.has("s1")).toBe(true);
    expect(removed).toEqual(["s1"]);
    expect(dibayIncomingLaneStopRing).not.toHaveBeenCalled();
  });

  it("stops ring when ringStopSource is provided (group accept)", () => {
    dismissIncomingPresenterAfterAccept({
      sessionId: "g1",
      dismissedAt: new Map(),
      hardClearedAt: new Map(),
      activeIncomingCallIds: new Set(),
      suppressMissedSound: new Set(),
      ringStopSource: "group_accept",
      removeSessionFromIncomingList: () => {},
    });
    expect(dibayIncomingLaneStopRing).toHaveBeenCalledWith("group_accept", "g1");
  });

  it("markIncomingCallHardClearedSession only sets hard clear map", () => {
    const hard = new Map<string, number>();
    markIncomingCallHardClearedSession(hard, "s-hard");
    expect(hard.has("s-hard")).toBe(true);
  });
});

import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  hasHomeCatchupRoomUnreadIncrease,
  snapshotHomeListRoomUnreadById,
  resetHomeCatchupDirtyCoalesceForTests,
  HOME_REALTIME_CATCHUP_DIRTY_REASON,
  HOME_VISIBILITY_RESUME_GAP_PROBE_DELAY_MS,
} from "@/lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list";

/**
 * P4-a — Background dirty signal (gap-observed only).
 *
 * CONTRACT:
 *   reconnect/schedule entry → dirty 0
 *   visibility onVis → schedule probe after quiet (no immediate dirty)
 *   catch-up same/decrease → dirty 0
 *   catch-up room unread increase / new unread room → dirty 1 (coalesced)
 *   visibility + reconnect probes coalesce → probe ≤1 / dirty ≤1 per resume
 *   reuse P3-c2 markNotificationBadgePollDirty only (no fresh GET)
 *
 * EXCLUDED: RT health, reconnect policy, poll interval, ACK/Boot/Auth,
 * P3-c1/c3 decrease, merge_summary(R3), Builder, UI/i18n.
 */

const root = process.cwd();
const FILE = "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts";

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function room(id: string, unreadCount: number): CommunityMessengerRoomSummary {
  return { id, unreadCount } as CommunityMessengerRoomSummary;
}

describe("P4-a background dirty signal (static)", () => {
  it("reuses the existing P3-c2 dirty poll entry point", () => {
    const code = stripComments(read(FILE));
    expect(code).toContain("markNotificationBadgePollDirty");
    expect(code).toContain(
      'import { markNotificationBadgePollDirty } from "@/lib/notifications/notification-badge-count-store"'
    );
    expect(code).toContain("HOME_REALTIME_CATCHUP_DIRTY_REASON");
    expect(HOME_REALTIME_CATCHUP_DIRTY_REASON).toBe("home_realtime_reconnect_catchup");
  });

  it("does not mark dirty on scheduleHomeRealtimeRefresh entry (reconnect burst ≠ dirty)", () => {
    const code = stripComments(read(FILE));
    const schedIdx = code.indexOf("const scheduleHomeRealtimeRefresh");
    expect(schedIdx).toBeGreaterThan(-1);
    const runIdx = code.indexOf("const runSilentHomeSync", schedIdx);
    expect(runIdx).toBeGreaterThan(schedIdx);
    const entrySlice = code.slice(schedIdx, runIdx);
    expect(entrySlice).not.toContain("markNotificationBadgePollDirty");
    expect(entrySlice).not.toContain("markHomeCatchupDirtyOnce");
  });

  it("marks dirty only after gap predicate inside shared catch-up probe", () => {
    const code = stripComments(read(FILE));
    expect(code).toContain("hasHomeCatchupRoomUnreadIncrease");
    expect(code).toContain("runHomeCatchupGapProbe");
    const probeIdx = code.indexOf("const runHomeCatchupGapProbe");
    expect(probeIdx).toBeGreaterThan(-1);
    const probe = code.slice(probeIdx, probeIdx + 1800);
    expect(probe).toContain("hasHomeCatchupRoomUnreadIncrease");
    expect(probe).toContain("if (gap)");
    expect(probe).toContain("markHomeCatchupDirtyOnce()");
    expect(probe).not.toContain("requestNotificationBadgeCountResync");
  });

  it("schedules visibility resume gap probe only after quiet window", () => {
    const code = stripComments(read(FILE));
    expect(HOME_VISIBILITY_RESUME_GAP_PROBE_DELAY_MS).toBe(4200);
    expect(code).toContain("scheduleVisibilityResumeGapProbe");
    expect(code).toContain("HOME_VISIBILITY_RESUME_GAP_PROBE_DELAY_MS");
    const schedVisIdx = code.indexOf("const scheduleVisibilityResumeGapProbe");
    expect(schedVisIdx).toBeGreaterThan(-1);
    const schedVis = code.slice(schedVisIdx, schedVisIdx + 900);
    expect(schedVis).toContain("setTimeout");
    expect(schedVis).toContain("HOME_VISIBILITY_RESUME_GAP_PROBE_DELAY_MS");
    expect(schedVis).toContain("runHomeCatchupGapProbe");
    expect(schedVis).not.toContain("markHomeCatchupDirtyOnce");
    expect(schedVis).not.toContain("markNotificationBadgePollDirty");
  });

  it("does not mark dirty from the plain visibility handler (schedules probe only)", () => {
    const code = stripComments(read(FILE));
    const onVisIdx = code.indexOf("const onVis = ()");
    expect(onVisIdx).toBeGreaterThan(-1);
    const onVisBlock = code.slice(onVisIdx, onVisIdx + 550);
    expect(onVisBlock).toContain("noteHomeVisibilityRestored");
    expect(onVisBlock).toContain("scheduleVisibilityResumeGapProbe");
    expect(onVisBlock).not.toContain("markNotificationBadgePollDirty");
    expect(onVisBlock).not.toContain("markHomeCatchupDirtyOnce");
    expect(onVisBlock).not.toContain("requestNotificationBadgeCountResync");
    expect(onVisBlock).not.toContain("runHomeCatchupGapProbe()");
  });

  it("coalesces probe + dirty producers to single call sites", () => {
    const code = stripComments(read(FILE));
    expect(code.split("markNotificationBadgePollDirty(").length - 1).toBe(1);
    // definition + one call inside gap branch
    expect(code.split("markHomeCatchupDirtyOnce(").length - 1).toBe(2);
    expect(code).toContain("beginHomeCatchupGapProbeOrSkip");
    // shared probe used from reconnect runner + visibility timer
    expect(code.split("runHomeCatchupGapProbe()").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("does not introduce a new poll policy or force fresh GET", () => {
    const code = stripComments(read(FILE));
    expect(code).not.toContain("POLL_MS");
    expect(code).not.toContain("setInterval");
    const dirtyIdx = code.indexOf("markNotificationBadgePollDirty(");
    const around = code.slice(dirtyIdx, dirtyIdx + 160);
    expect(around).not.toContain("requestNotificationBadgeCountResync");
  });
});

describe("P4-a gap predicate (room unread)", () => {
  beforeEach(() => {
    resetHomeCatchupDirtyCoalesceForTests();
  });

  it("same totals → no gap", () => {
    const before = snapshotHomeListRoomUnreadById({
      chats: [room("a", 1), room("b", 2)],
      groups: [room("g", 0)],
    });
    expect(hasHomeCatchupRoomUnreadIncrease(before, [room("a", 1), room("b", 2), room("g", 0)])).toBe(
      false
    );
  });

  it("room unread increase → gap", () => {
    const before = snapshotHomeListRoomUnreadById({ chats: [room("a", 1)], groups: [] });
    expect(hasHomeCatchupRoomUnreadIncrease(before, [room("a", 2)])).toBe(true);
  });

  it("decrease or same room → no gap", () => {
    const before = snapshotHomeListRoomUnreadById({ chats: [room("a", 3)], groups: [] });
    expect(hasHomeCatchupRoomUnreadIncrease(before, [room("a", 1)])).toBe(false);
    expect(hasHomeCatchupRoomUnreadIncrease(before, [room("a", 3)])).toBe(false);
  });

  it("new room with unread>0 → gap; new room unread 0 → no gap", () => {
    const before = snapshotHomeListRoomUnreadById({ chats: [room("a", 0)], groups: [] });
    expect(hasHomeCatchupRoomUnreadIncrease(before, [room("a", 0), room("new", 1)])).toBe(true);
    expect(hasHomeCatchupRoomUnreadIncrease(before, [room("a", 0), room("new", 0)])).toBe(false);
  });

  it("partial after list still detects increase without sum taxonomy mix", () => {
    const before = snapshotHomeListRoomUnreadById({
      chats: [room("a", 1), room("b", 5)],
      groups: [room("g", 2)],
    });
    expect(hasHomeCatchupRoomUnreadIncrease(before, [room("a", 2)])).toBe(true);
    expect(hasHomeCatchupRoomUnreadIncrease(before, [room("a", 1)])).toBe(false);
  });
});

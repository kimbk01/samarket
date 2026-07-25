import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  hasHomeCatchupRoomUnreadIncrease,
  snapshotHomeListRoomUnreadById,
  resetHomeCatchupDirtyCoalesceForTests,
  HOME_REALTIME_CATCHUP_DIRTY_REASON,
} from "@/lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list";

/**
 * P4-a — Background dirty signal (gap-observed only).
 *
 * CONTRACT:
 *   reconnect/schedule alone → dirty 0
 *   catch-up same room unread → dirty 0
 *   catch-up room unread increase → dirty 1 (coalesced)
 *   plain onVis → dirty 0
 *   reuse P3-c2 markNotificationBadgePollDirty only (no fresh GET / new poll policy)
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

  it("marks dirty only after gap predicate inside catch-up runner", () => {
    const code = stripComments(read(FILE));
    expect(code).toContain("hasHomeCatchupRoomUnreadIncrease");
    expect(code).toContain("markHomeCatchupDirtyOnce");
    const runIdx = code.indexOf("const runSilentHomeSync");
    expect(runIdx).toBeGreaterThan(-1);
    const runner = code.slice(runIdx, runIdx + 2200);
    expect(runner).toContain("hasHomeCatchupRoomUnreadIncrease");
    expect(runner).toContain("if (gap)");
    expect(runner).toContain("markHomeCatchupDirtyOnce()");
    const gapInRunner = runner.indexOf("hasHomeCatchupRoomUnreadIncrease");
    const ifGapInRunner = runner.indexOf("if (gap)");
    const dirtyInRunner = runner.indexOf("markHomeCatchupDirtyOnce()");
    expect(dirtyInRunner).toBeGreaterThan(ifGapInRunner);
    expect(ifGapInRunner).toBeGreaterThan(gapInRunner);
  });

  it("calls the dirty producer exactly once in source (coalesced helper)", () => {
    const code = stripComments(read(FILE));
    expect(code.split("markNotificationBadgePollDirty(").length - 1).toBe(1);
    // one definition + one call site inside `if (gap)`
    expect(code.split("markHomeCatchupDirtyOnce(").length - 1).toBe(2);
    expect(code).toContain("if (gap)");
    expect(code).toContain("markHomeCatchupDirtyOnce()");
  });

  it("does not mark dirty from the plain visibility handler", () => {
    const code = stripComments(read(FILE));
    const onVisIdx = code.indexOf("const onVis = ()");
    expect(onVisIdx).toBeGreaterThan(-1);
    const onVisBlock = code.slice(onVisIdx, onVisIdx + 400);
    expect(onVisBlock).toContain("noteHomeVisibilityRestored");
    expect(onVisBlock).not.toContain("markNotificationBadgePollDirty");
    expect(onVisBlock).not.toContain("markHomeCatchupDirtyOnce");
    expect(onVisBlock).not.toContain("requestNotificationBadgeCountResync");
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
    // critical_patch-like partial: only room a — must not treat missing b/g as decrease noise
    expect(hasHomeCatchupRoomUnreadIncrease(before, [room("a", 2)])).toBe(true);
    expect(hasHomeCatchupRoomUnreadIncrease(before, [room("a", 1)])).toBe(false);
  });
});

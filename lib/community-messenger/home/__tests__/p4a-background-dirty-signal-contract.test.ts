import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * P4-a — Background dirty signal (conditional resume/reconnect catch-up).
 *
 * CONTRACT:
 *   RT reconnect / list catch-up (scheduleHomeRealtimeRefresh) → markNotificationBadgePollDirty 1
 *   plain visibility resume (onVis) → NO markNotificationBadgePollDirty (clean resume HTTP 0)
 *   reuse of existing P3-c2 dirty poll fallback entry point only (no new coordinator/policy)
 *
 * EXCLUDED: RT health coordinator, reconnect policy, poll interval, ACK/Boot/Auth,
 * participant decrease rule (P3-c1/P3-c3), merge_summary(R3), version, Builder, UI/i18n.
 */

const root = process.cwd();
const FILE = "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts";

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("P4-a background dirty signal (static)", () => {
  it("reuses the existing P3-c2 dirty poll entry point", () => {
    const code = stripComments(read(FILE));
    expect(code).toContain("markNotificationBadgePollDirty");
    expect(code).toContain(
      'import { markNotificationBadgePollDirty } from "@/lib/notifications/notification-badge-count-store"'
    );
  });

  it("sets dirty only inside the reconnect/catch-up callback", () => {
    const code = stripComments(read(FILE));
    const schedIdx = code.indexOf("const scheduleHomeRealtimeRefresh");
    expect(schedIdx).toBeGreaterThan(-1);
    // The single dirty call lives at the top of scheduleHomeRealtimeRefresh.
    const dirtyIdx = code.indexOf("markNotificationBadgePollDirty(");
    expect(dirtyIdx).toBeGreaterThan(schedIdx);
    // and before this callback's own quiet-window guard.
    const quietIdx = code.indexOf(
      "shouldBlockSilentHomeSyncForVisibilityRestore()",
      schedIdx
    );
    expect(quietIdx).toBeGreaterThan(dirtyIdx);
  });

  it("calls the dirty producer exactly once (no unconditional resume storm)", () => {
    const code = stripComments(read(FILE));
    const occurrences = code.split("markNotificationBadgePollDirty(").length - 1;
    expect(occurrences).toBe(1);
  });

  it("does not mark dirty from the plain visibility handler", () => {
    const code = stripComments(read(FILE));
    // Locate the visibilitychange effect body (onVis) and ensure it stays badge-neutral.
    const onVisIdx = code.indexOf("const onVis = ()");
    expect(onVisIdx).toBeGreaterThan(-1);
    const onVisBlock = code.slice(onVisIdx, onVisIdx + 400);
    expect(onVisBlock).toContain("noteHomeVisibilityRestored");
    expect(onVisBlock).not.toContain("markNotificationBadgePollDirty");
    expect(onVisBlock).not.toContain("requestNotificationBadgeCountResync");
  });

  it("does not introduce a new poll policy or RT health coordinator", () => {
    const code = stripComments(read(FILE));
    // P3-c2 poll interval constant and single-flight remain owned by the store, not here.
    expect(code).not.toContain("POLL_MS");
    expect(code).not.toContain("setInterval");
    // dirty producer must not force a fresh GET on resume (poll fallback owns recovery).
    const dirtyIdx = code.indexOf("markNotificationBadgePollDirty(");
    const around = code.slice(dirtyIdx, dirtyIdx + 120);
    expect(around).not.toContain("requestNotificationBadgeCountResync");
  });
});

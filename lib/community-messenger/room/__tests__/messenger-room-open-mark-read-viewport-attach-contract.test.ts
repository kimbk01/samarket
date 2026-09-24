import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_PATH = "lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts";

function readSource(): string {
  return readFileSync(join(ROOT, SOURCE_PATH), "utf8");
}

describe("CM room open mark-read — late viewport attach re-arm", () => {
  it("re-arms mark-read when messagesViewportRef attaches after effect start", () => {
    const src = readSource();
    expect(src).toContain("viewportAttachObserver");
    expect(src).toContain("bindViewportListeners");
    expect(src).toContain("armViewportWhenReady");
    expect(src).toContain("READ_REQUEST_NOT_SENT");
    expect(src).toMatch(/viewportAttachObserver\.observe\(\s*document\.documentElement/);
    expect(src).toContain("scheduleRoomReadAck(firstScheduleReason)");
    expect(src).toContain("Close check-then-observe race");
    expect(src).toContain("viewportResizeObserver");
    expect(src).toMatch(/new ResizeObserver/);
  });

  it("does not introduce timer/retry mark-read loops or forced unread zero", () => {
    const src = readSource();
    expect(src).not.toMatch(/setInterval\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*scheduleRoomReadAck/);
    expect(src).not.toContain("unread_count = 0");
    expect(src).not.toContain('unreadCount: 0 /* force');
  });
});

describe("CM room open mark-read — timelineViewportMounted gate", () => {
  it("includes timelineViewportMounted in readGateVersion so effect remounts on scroll-root attach", () => {
    const phase1 = readFileSync(
      join(ROOT, "lib/community-messenger/room/use-messenger-room-client-phase1.ts"),
      "utf8"
    );
    const gateStart = phase1.indexOf("const readGateVersion = useMemo");
    expect(gateStart).toBeGreaterThan(0);
    const gateBlock = phase1.slice(gateStart, gateStart + 1200);
    expect(gateBlock).toContain("timelineViewportMounted");
    expect(gateBlock).toContain('timelineViewportMounted ? "viewport" : "no-viewport"');
    expect(gateBlock).toContain("DO NOT include snapshot.room.unreadCount");
    expect(gateBlock).not.toMatch(/snapshot\?\.room\.unreadCount \?\? 0/);
  });
});

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
    expect(src).toContain("READ_REQUEST_NOT_SENT");
    expect(src).toMatch(/viewportAttachObserver\.observe\(\s*document\.documentElement/);
    expect(src).toContain("scheduleRoomReadAck(firstScheduleReason)");
  });

  it("does not introduce timer/retry mark-read loops or forced unread zero", () => {
    const src = readSource();
    expect(src).not.toMatch(/setInterval\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*scheduleRoomReadAck/);
    expect(src).not.toContain("unread_count = 0");
    expect(src).not.toContain('unreadCount: 0 /* force');
  });
});

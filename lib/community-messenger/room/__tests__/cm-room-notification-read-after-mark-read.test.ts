import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_PATH = "lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts";

function readSource(): string {
  return readFileSync(join(ROOT, SOURCE_PATH), "utf8");
}

describe("CM room notification_events read after mark_read", () => {
  it("B2: atomic PATCH badgeAck skip room-read; else room-read fallback", () => {
    const src = readSource();

    expect(src).toContain("postNotificationRoomReadWithAck");
    expect(src).toContain("readRoomNotificationEventsAfterServerRead()");
    expect(src).toContain('json.roomReadFollowUp === "skip"');
    expect(src).toContain("applyDomainBadgeAuthorityFromReadAck(json.badgeAck");
    expect(src).toContain("parsed.okHttp && json.ok === true");
  });

  it("does not use read-thread for mark_read notification_events cleanup", () => {
    const src = readSource();

    expect(src).not.toContain("postNotificationThreadRead");
    expect(src).not.toContain("/api/me/notifications/read-thread");
    expect(src).not.toContain("visibleMessageId");
  });
});

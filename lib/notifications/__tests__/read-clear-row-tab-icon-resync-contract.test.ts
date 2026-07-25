import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("read-clear row/tab/icon resync contract", () => {
  it("afterNotificationEventsRead always reconciles (ACK apply or resync fallback)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/client/notification-event-read-client.ts"),
      "utf8"
    );
    expect(src).toContain("function afterNotificationEventsRead");
    expect(src).toContain("applyDomainBadgeAuthorityFromReadAck");
    expect(src).toContain("resyncBadgesAfterNotificationEventsRead(reason)");
    // Early return after categoryCounts patch alone is forbidden (Chat room-count would stick).
    expect(src).not.toMatch(/if \(patched\) \{\s*requestMessengerHubBadgeResync/);
  });

  it("resyncBadgesAfterNotificationEventsRead routes through contract only (P1-a: no duplicate badge-count)", () => {
    const resyncSrc = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/client/notification-events-read-resync.ts"),
      "utf8"
    );
    expect(resyncSrc).toContain("requestMessengerHubBadgeResync");
    expect(resyncSrc).toContain("P1-a LOCK");
    // Duplicate badge-count after hub resync is forbidden (contract already includes one).
    expect(resyncSrc).not.toMatch(
      /requestMessengerHubBadgeResync\([^)]*\);\s*\n\s*requestNotificationBadgeCountResync/
    );
    const contractSrc = fs.readFileSync(
      path.join(
        process.cwd(),
        "lib/community-messenger/notifications/messenger-notification-contract.ts"
      ),
      "utf8"
    );
    expect(contractSrc).toContain("requestNotificationBadgeCountResync");
    expect(contractSrc).toContain("isProjectionOnlyHubResyncReason");
  });

  it("CommunityDetail posts community_post_opened on mount", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/community/CommunityDetail.tsx"),
      "utf8"
    );
    expect(src).toContain("postNotificationThreadRead");
    expect(src).toContain('readReason: "community_post_opened"');
    expect(src).toContain('threadType: "community_post"');
    expect(src).toContain("community_activity");
  });

  it("room open mark_read triggers postNotificationRoomRead", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts"
      ),
      "utf8"
    );
    expect(src).toContain("postNotificationRoomRead");
    expect(src).toContain("requestMessengerHubBadgeResync");
  });
});

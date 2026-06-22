import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("NotificationRouteReadSync contract", () => {
  const source = readFileSync(
    join(process.cwd(), "components/push/NotificationRouteReadSync.tsx"),
    "utf8"
  );

  it("defers chat room notification read via policy helper", () => {
    expect(source).toContain("isNotificationReadDeferredChatRoomPath");
    expect(source).toContain("postNotificationCallLogsMissedCallsRead");
    expect(source).toContain("postNotificationMissedCallRead");
  });

  it("does not call legacy room-read or postNotificationRoomRead on chat routes", () => {
    expect(source).not.toContain("postNotificationRoomRead");
    expect(source).not.toContain("postNotificationThreadRead");
    expect(source).not.toMatch(/\/api\/me\/notifications\/room-read/);
  });
});

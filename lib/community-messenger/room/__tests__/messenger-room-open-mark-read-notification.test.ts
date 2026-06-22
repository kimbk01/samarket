import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("useMessengerRoomOpenMarkReadEffect notification read contract", () => {
  const source = readFileSync(
    join(process.cwd(), "lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts"),
    "utf8"
  );

  it("awaits postNotificationThreadRead after mark_read success", () => {
    expect(source).toContain("await postNotificationThreadRead");
    expect(source).toContain("readRoomNotificationEventsAfterServerRead");
  });

  it("sets notificationThreadReadDoneRef only after thread read succeeds", () => {
    expect(source).toMatch(/if \(ok\) notificationThreadReadDoneRef\.current = true/);
    expect(source).not.toMatch(
      /notificationThreadReadDoneRef\.current = true;[\s\S]*postNotificationThreadRead/
    );
  });

  it("uses trade vs chat categories from room snapshot", () => {
    expect(source).toContain('threadType: snap.room.contextMeta?.kind === "trade" ? "trade_room" : "chat_room"');
    expect(source).toContain("roomNotificationReadCategories(snap)");
  });
});

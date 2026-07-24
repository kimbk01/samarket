import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(process.cwd(), "app/api/community-messenger/rooms/[roomId]/messages/route.ts"),
  "utf8"
);

describe("CM message send Domain target bump before ACK", () => {
  it("awaits bumpMessengerRoomTargetsForRecipients before after()", () => {
    expect(src).toContain("bumpMessengerRoomTargetsForRecipients");
    const syncBump = src.indexOf("await bumpMessengerRoomTargetsForRecipients");
    const afterCall = src.indexOf("after(async () => {");
    expect(syncBump).toBeGreaterThan(-1);
    expect(afterCall).toBeGreaterThan(-1);
    expect(syncBump).toBeLessThan(afterCall);
  });

  it("keeps realtime publishMessengerRoomBumpAfterMutation in after()", () => {
    const afterCall = src.indexOf("after(async () => {");
    const publish = src.indexOf("publishMessengerRoomBumpAfterMutation", afterCall);
    expect(publish).toBeGreaterThan(afterCall);
  });
});

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

  it("keeps realtime publishMessengerRoomBumpAfterMutation in after() with skipBadgeTargetBump", () => {
    const afterCall = src.indexOf("after(async () => {");
    const publish = src.indexOf("publishMessengerRoomBumpAfterMutation", afterCall);
    expect(publish).toBeGreaterThan(afterCall);
    expect(src).toContain("skipBadgeTargetBump: true");
  });
});

const publishSrc = readFileSync(
  join(process.cwd(), "lib/community-messenger/server/publish-messenger-room-bump.ts"),
  "utf8"
);

describe("publishMessengerRoomBumpAfterMutation skipBadgeTargetBump", () => {
  it("returns before target bump when skipBadgeTargetBump is true", () => {
    expect(publishSrc).toContain("skipBadgeTargetBump?: boolean");
    expect(publishSrc).toContain("if (args.skipBadgeTargetBump === true) return;");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M-1 — 1:1 messages route after(): bump publish must appear before deferred FCM/mirror.
 * Source-order lock (no runtime after() harness in unit env).
 */
describe("community-messenger 1:1 messages after() order (M-1)", () => {
  it("publishes room bump before deferred post-ack effects", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/community-messenger/rooms/[roomId]/messages/route.ts"),
      "utf8"
    );
    const bumpIdx = src.indexOf("publishMessengerRoomBumpAfterMutation(bumpArgs)");
    const deferredIdx = src.indexOf("runCommunityMessengerSendDeferredPostAckEffects");
    expect(bumpIdx).toBeGreaterThan(0);
    expect(deferredIdx).toBeGreaterThan(0);
    expect(bumpIdx).toBeLessThan(deferredIdx);
    // Isolated try blocks — bump failure must not share catch with FCM
    const afterBlock = src.slice(src.indexOf("after(async () => {"), src.indexOf("let responsePayload"));
    expect(afterBlock).toMatch(/publishMessengerRoomBumpAfterMutation[\s\S]*?catch/);
    expect(afterBlock).toMatch(/runCommunityMessengerSendDeferredPostAckEffects[\s\S]*?catch/);
  });

  it("does not await bump before ACK return (stays inside after)", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/community-messenger/rooms/[roomId]/messages/route.ts"),
      "utf8"
    );
    const beforeAfter = src.slice(0, src.indexOf("after(async () => {"));
    expect(beforeAfter.includes("await publishMessengerRoomBumpAfterMutation")).toBe(false);
  });
});

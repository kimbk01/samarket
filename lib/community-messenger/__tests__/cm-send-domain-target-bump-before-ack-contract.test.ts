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

  it("awaits durable notification accept before after(); defers FCM+mirror to after()", () => {
    const durable = src.indexOf("await runCommunityMessengerSendDurablePreAckEffects");
    const afterCall = src.indexOf("after(async () => {");
    expect(durable).toBeGreaterThan(-1);
    expect(afterCall).toBeGreaterThan(-1);
    expect(durable).toBeLessThan(afterCall);
    const afterBlock = src.slice(afterCall);
    expect(afterBlock).toContain("runCommunityMessengerSendDeferredPostAckEffects");
    expect(afterBlock).not.toContain("runCommunityMessengerSendDurablePreAckEffects");
    // Full sync bundle must not be the only path before ACK anymore.
    expect(src.indexOf("await runCommunityMessengerSendPostAckEffects")).toBe(-1);
  });

  it("W4/M-1: awaits bounded realtime bump BEFORE ACK; after() only retries on failure (skipBadgeTargetBump)", () => {
    const afterCall = src.indexOf("after(async () => {");
    const bounded = src.indexOf("await publishMessengerRoomBumpBounded(bumpArgs)");
    expect(bounded).toBeGreaterThan(-1);
    expect(bounded).toBeLessThan(afterCall);
    const afterBlock = src.slice(afterCall);
    expect(afterBlock).toMatch(/if \(!bumpResult\.ok\) \{[\s\S]*publishMessengerRoomBumpAfterMutation\(bumpArgs\)/);
    /** 푸시(FCM) 가 bump 보다 먼저 끝나야 하는 순서가 다시 생기지 않게 */
    expect(afterBlock.indexOf("publishMessengerRoomBumpAfterMutation")).toBeLessThan(
      afterBlock.indexOf("runCommunityMessengerSendDeferredPostAckEffects")
    );
    expect(src).toContain("skipBadgeTargetBump: true");
  });

  it("M-11/M-12: caches only successful results; commit-unknown rereads by cid then 503", () => {
    expect(src).toMatch(/if \(r\.ok\) \{\n\s+const tStore = Date\.now\(\);\n\s+sendDedupe\.set/);
    expect(src).toContain('"commit_unknown"');
    expect(src).toMatch(/commit_unknown" \? 503/);
  });
});

const groupSrc = readFileSync(
  join(process.cwd(), "app/api/community-messenger/group-rooms/[roomId]/messages/route.ts"),
  "utf8"
);

describe("CM group-rooms message send notify before ACK", () => {
  it("awaits durable notify + target bump before after(); defers FCM/mirror", () => {
    const durable = groupSrc.indexOf("await runCommunityMessengerSendDurablePreAckEffects");
    const syncBump = groupSrc.indexOf("await bumpMessengerRoomTargetsForRecipients");
    const afterCall = groupSrc.indexOf("after(async () => {");
    expect(durable).toBeGreaterThan(-1);
    expect(syncBump).toBeGreaterThan(-1);
    expect(afterCall).toBeGreaterThan(-1);
    expect(Math.max(durable, syncBump)).toBeLessThan(afterCall);
    expect(groupSrc.slice(afterCall)).toContain("runCommunityMessengerSendDeferredPostAckEffects");
    expect(groupSrc).toContain("skipBadgeTargetBump: true");
    expect(groupSrc.indexOf("await publishMessengerRoomBumpBounded(bumpArgs)")).toBeLessThan(afterCall);
  });

  it("M-10: no content-prefix dedupe key", () => {
    expect(groupSrc).not.toContain("content.slice(0, 24)");
  });
});

const publishSrc = readFileSync(
  join(process.cwd(), "lib/community-messenger/server/publish-messenger-room-bump.ts"),
  "utf8"
);

describe("publishMessengerRoomBumpAfterMutation skipBadgeTargetBump", () => {
  it("returns before target bump when skipBadgeTargetBump is true", () => {
    expect(publishSrc).toContain("skipBadgeTargetBump?: boolean");
    expect(publishSrc).toContain("if (args.skipBadgeTargetBump === true) return publishResult;");
  });
});

const serviceSrc = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
const postAckSrc = readFileSync(
  join(process.cwd(), "lib/community-messenger/server/community-messenger-send-post-ack-effects.ts"),
  "utf8"
);

describe("Trade item_trade ledger mirror single authority (post-ack)", () => {
  it("service send paths never call mirrorCommunityMessengerTextToItemTradeLedger", () => {
    expect(serviceSrc).not.toContain("mirrorCommunityMessengerTextToItemTradeLedger");
  });

  it("atomic RPC and fallback both hand itemTradeLedgerId to postAckEffects only", () => {
    const atomicStart = serviceSrc.indexOf("async function trySendCommunityMessengerTextAtomic");
    const sendStart = serviceSrc.indexOf("export async function sendCommunityMessengerMessage");
    const atomicFn = serviceSrc.slice(atomicStart, sendStart);
    const sendFn = serviceSrc.slice(sendStart, sendStart + 12000);
    expect(atomicFn).toContain("itemTradeLedgerId");
    expect(atomicFn).toContain("postAckEffects");
    expect(atomicFn).toContain("itemTradeChatRoomIdFromMessengerDirectKey");
    expect(sendFn).toContain("itemTradeLedgerId");
    expect(sendFn).toContain("postAckEffects:");
    expect(sendFn).toContain("itemTradeChatRoomIdFromMessengerDirectKey");
    // Exactly one mirror call site lives in deferred post-ack effects (not service).
    const mirrorCallsInPostAck = postAckSrc.split("mirrorCommunityMessengerTextToItemTradeLedger(").length - 1;
    expect(mirrorCallsInPostAck).toBe(1);
    expect(postAckSrc).toContain("if (effects.itemTradeLedgerId)");
    expect(postAckSrc).toContain("runCommunityMessengerSendDeferredPostAckEffects");
    expect(postAckSrc).toContain("deferPush: true");
  });

  it("message POST awaits durable pre-ack once; mirror only in after()", () => {
    const awaitDurable = src.split("await runCommunityMessengerSendDurablePreAckEffects").length - 1;
    expect(awaitDurable).toBe(1);
    const afterCall = src.indexOf("after(async () => {");
    expect(src.slice(afterCall)).toContain("runCommunityMessengerSendDeferredPostAckEffects");
    expect(src.slice(0, afterCall)).not.toContain("mirrorCommunityMessengerTextToItemTradeLedger");
  });
});

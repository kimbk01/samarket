import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(process.cwd(), "app/api/community-messenger/rooms/[roomId]/messages/route.ts"),
  "utf8"
);
const respondIdx = src.indexOf("let responsePayload");

describe("CM message send Domain target bump before ACK (P2 보수안)", () => {
  it("awaits the parallel target bump (text route only) before ACK", () => {
    expect(src).toContain("bumpMessengerRoomTargetsForRecipientsParallel(sb, {");
    const awaitTarget = src.indexOf("await targetPromise");
    expect(awaitTarget).toBeGreaterThan(-1);
    expect(awaitTarget).toBeLessThan(respondIdx);
    /** 통화 기록 bump 경로가 공유하는 기존 순차 함수는 텍스트 route 가 부르지 않는다(I7) */
    expect(src).not.toMatch(/bumpMessengerRoomTargetsForRecipients\(/);
  });

  it("awaits durable notification accept before ACK with opt-in parallel + deferred auto-read; FCM+mirror in after()", () => {
    expect(src).toContain("runCommunityMessengerSendDurablePreAckEffects(sb, postAckEffects, t5 ?? undefined, {");
    expect(src).toMatch(/parallelRecipients: true,\s*\n\s*deferAutoRead: true/);
    const awaitDurable = src.indexOf("deferredPostAck = await durablePromise");
    expect(awaitDurable).toBeGreaterThan(-1);
    expect(awaitDurable).toBeLessThan(respondIdx);
    const fcm = src.lastIndexOf("runCommunityMessengerSendDeferredPostAckEffects(sb, deferredPostAck");
    expect(src.lastIndexOf("after(async () => {", fcm)).toBeGreaterThan(-1);
    expect(src.indexOf("await runCommunityMessengerSendPostAckEffects")).toBe(-1);
  });

  it("auto-read (markRoomRead) runs only after target bump completes", () => {
    const awaitTarget = src.indexOf("await targetPromise");
    const autoRead = src.indexOf("markRoomRead(sb, rid, canonicalRoomId)");
    expect(autoRead).toBeGreaterThan(awaitTarget);
    expect(autoRead).toBeLessThan(respondIdx);
  });

  it("room bump goes through publishTextSendRoomBump (fallback keeps skipBadgeTargetBump)", () => {
    expect(src).toContain("publishTextSendRoomBump(bumpArgs)");
    const textBumpSrc = readFileSync(
      join(process.cwd(), "lib/community-messenger/server/publish-text-send-room-bump.ts"),
      "utf8"
    );
    expect(textBumpSrc).toContain("publishMessengerRoomBumpAfterMutation({");
    expect(textBumpSrc).toContain("skipBadgeTargetBump: true");
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
    const mirrorCallsInPostAck = postAckSrc.split("mirrorCommunityMessengerTextToItemTradeLedger(").length - 1;
    expect(mirrorCallsInPostAck).toBe(1);
    expect(postAckSrc).toContain("if (effects.itemTradeLedgerId)");
    expect(postAckSrc).toContain("runCommunityMessengerSendDeferredPostAckEffects");
    expect(postAckSrc).toContain("deferPush: true");
  });

  it("message POST runs durable pre-ack once; mirror only in after()", () => {
    expect(src.split("runCommunityMessengerSendDurablePreAckEffects(").length - 1).toBe(1);
    expect(src.slice(0, respondIdx)).not.toContain("mirrorCommunityMessengerTextToItemTradeLedger");
  });
});

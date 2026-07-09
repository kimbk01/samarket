import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readEffectSrc = readFileSync(
  join(process.cwd(), "lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts"),
  "utf8"
);
const bridgeSrc = readFileSync(
  join(process.cwd(), "lib/notifications/notification-target-messenger-bridge.ts"),
  "utf8"
);

describe("CM room order authority read contract", () => {
  it("routes delivery rooms to OrderDomain read API before CM mark_read", () => {
    expect(readEffectSrc).toContain('meta?.kind !== "delivery"');
    expect(readEffectSrc).toContain('fetch("/api/domains/order/read-order-chat"');

    const immediateOrderBranch = readEffectSrc.indexOf("const orderReadInput = resolveOrderChatReadInput(snap, id, tailId)");
    const immediateCmMarkRead = readEffectSrc.indexOf("fetch(communityMessengerRoomResourcePath(id)", immediateOrderBranch);
    const immediateReturn = readEffectSrc.indexOf("return;", immediateOrderBranch);
    expect(immediateOrderBranch).toBeGreaterThan(-1);
    expect(immediateReturn).toBeGreaterThan(immediateOrderBranch);
    expect(immediateCmMarkRead).toBeGreaterThan(immediateReturn);
  });

  it("does not use notification room-read or Messenger resync for order success", () => {
    const orderBranch = readEffectSrc.slice(
      readEffectSrc.indexOf("const orderReadInput = resolveOrderChatReadInput(snap, id, lastReadMessageId)"),
      readEffectSrc.indexOf("let alignMs = 0;")
    );
    expect(orderBranch).toContain("postOrderChatRead(orderReadInput)");
    expect(orderBranch).not.toContain("postNotificationRoomRead");
    expect(orderBranch).not.toContain("requestMessengerHubBadgeResync");
    expect(orderBranch).not.toContain("communityMessengerRoomResourcePath");
  });

  it("keeps buyer_order and owner_order_chat clear out of Messenger bridge", () => {
    const deliveryStart = bridgeSrc.indexOf('if (kind === "delivery")');
    const deliveryEnd = bridgeSrc.indexOf("await clearChatRoomTargetFromMessengerRead", deliveryStart);
    const deliveryClearBranch = bridgeSrc.slice(deliveryStart, deliveryEnd);
    expect(deliveryClearBranch).toContain("OrderDomain.readOrderChat owns buyer_order / owner_order_chat clear");
    expect(deliveryClearBranch).not.toContain("clearNotificationTarget");
    expect(deliveryClearBranch).not.toContain("clearChatRoomTargetFromMessengerRead");
  });
});

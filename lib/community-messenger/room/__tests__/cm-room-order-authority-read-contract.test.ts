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
const readOrderSrc = readFileSync(join(process.cwd(), "lib/order-domain/read-order-chat.ts"), "utf8");

function sliceBetween(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

const immediateOrderBranch = sliceBetween(
  readEffectSrc,
  "const orderReadInput = resolveOrderChatReadInput(snap, id, tailId)",
  "cmReadBadgeLog(\"room_enter_optimistic_zero\""
);

const scrollOrderBranch = sliceBetween(
  readEffectSrc,
  "const orderReadInput = resolveOrderChatReadInput(snap, id, lastReadMessageId)",
  "let alignMs = 0;"
);

describe("CM room order authority read contract", () => {
  it("keeps OrderDomain official success as full participant+target+events clear", () => {
    expect(readOrderSrc).toContain(
      "participantUnreadAfter !== 0 || targetUnreadAfter !== 0 || eventUnreadAfter !== 0"
    );
    expect(readOrderSrc).toContain('error: "order_chat_read_incomplete"');
    expect(readOrderSrc).toContain('targetType: "owner_order_chat"');
    expect(readOrderSrc).toContain('targetType: "buyer_order"');
  });

  it("routes delivery rooms to OrderDomain for both immediate_open and scroll_ack", () => {
    expect(readEffectSrc).toContain("isDeliveryOrderRoomSnapshot");
    expect(readEffectSrc).toContain('fetch("/api/domains/order/read-order-chat"');
    expect(immediateOrderBranch).toContain("postOrderChatRead(orderReadInput)");
    expect(scrollOrderBranch).toContain("postOrderChatRead(orderReadInput)");
    expect(immediateOrderBranch).toContain("path: \"immediate_open\"");
    expect(scrollOrderBranch).toContain("path: \"scroll_ack\"");
  });

  it("immediate_open: OrderDomain ok only → optimistic 1 · room-read 0 · CM mark_read 0 · resync 0", () => {
    expect(immediateOrderBranch).toContain("if (json.ok === true)");
    expect(immediateOrderBranch).toContain("applyOptimisticRoomRead(snap, tailId)");
    expect(immediateOrderBranch).not.toContain("readRoomNotificationEventsAfterServerRead");
    expect(immediateOrderBranch).not.toContain("postNotificationRoomRead");
    expect(immediateOrderBranch).not.toContain("requestMessengerHubBadgeResync");
    expect(immediateOrderBranch).not.toContain("communityMessengerRoomResourcePath");
    // success-before: no applyOptimistic outside ok branch
    const beforeOk = immediateOrderBranch.slice(0, immediateOrderBranch.indexOf("if (json.ok === true)"));
    expect(beforeOk).not.toContain("applyOptimisticRoomRead");
    expect((immediateOrderBranch.match(/applyOptimisticRoomRead\(/g) || []).length).toBe(1);
  });

  it("scroll_ack: OrderDomain ok only → optimistic 1 · room-read 0 · CM mark_read 0 · resync 0", () => {
    expect(scrollOrderBranch).toContain("if (json.ok === true)");
    expect(scrollOrderBranch).toContain("applyOptimisticRoomRead(snap, lastReadMessageId)");
    expect(scrollOrderBranch).not.toContain("readRoomNotificationEventsAfterServerRead");
    expect(scrollOrderBranch).not.toContain("postNotificationRoomRead");
    expect(scrollOrderBranch).not.toContain("requestMessengerHubBadgeResync");
    expect(scrollOrderBranch).not.toContain("communityMessengerRoomResourcePath");
    const beforeOk = scrollOrderBranch.slice(0, scrollOrderBranch.indexOf("if (json.ok === true)"));
    expect(beforeOk).not.toContain("applyOptimisticRoomRead");
    expect((scrollOrderBranch.match(/applyOptimisticRoomRead\(/g) || []).length).toBe(1);
  });

  it("blocks tryEarlyOptimisticListBadgeClear for delivery before OrderDomain success", () => {
    expect(readEffectSrc).toContain(
      "if (isDeliveryOrderRoomSnapshot(readableSnapshot)) return;"
    );
    expect(readEffectSrc).toContain("!isDeliveryOrderRoomSnapshot(snap)");
    expect(readEffectSrc).toContain("!isDeliveryOrderRoomSnapshot(snapEarly)");
  });

  it("failure paths keep unread (no extra clear / no Messenger fresh resync) on both branches", () => {
    for (const branch of [immediateOrderBranch, scrollOrderBranch]) {
      const failIdx = branch.indexOf("order_read_api_fail");
      expect(failIdx).toBeGreaterThan(-1);
      const afterFirstFail = branch.slice(failIdx);
      expect(afterFirstFail).not.toContain("applyOptimisticRoomRead");
      expect(afterFirstFail).not.toContain("requestMessengerHubBadgeResync");
      expect(afterFirstFail).not.toContain("readRoomNotificationEventsAfterServerRead");
      expect(branch).toContain('phase: "idle"');
    }
  });

  it("dispatches Customer and Owner refresh from OrderDomain role without dual writers", () => {
    const refreshFn = sliceBetween(
      readEffectSrc,
      "function dispatchOrderChatReadRefresh",
      "export function useMessengerRoomOpenMarkReadEffect"
    );
    expect(refreshFn).toContain('role === "owner"');
    expect(refreshFn).toContain("owner_order_chat");
    expect(refreshFn).toContain("KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH");
    expect(immediateOrderBranch).toContain("dispatchOrderChatReadRefresh(id, json.role)");
    expect(scrollOrderBranch).toContain("dispatchOrderChatReadRefresh(id, json.role)");
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

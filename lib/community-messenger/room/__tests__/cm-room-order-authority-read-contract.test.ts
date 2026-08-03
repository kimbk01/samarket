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

const scrollOrderBranch = sliceBetween(
  readEffectSrc,
  "const orderReadInput = resolveOrderChatReadInput(snap, id, lastReadMessageId)",
  "let alignMs = 0;"
);

describe("CM room order authority read contract", () => {
  it("keeps OrderDomain success gated on Room Unread Authority mark-read projection", () => {
    expect(readOrderSrc).toContain("dibay_mark_room_read_atomic");
    expect(readOrderSrc).not.toContain('error: "order_chat_read_incomplete"');
    expect(readOrderSrc).toContain("participantUnreadAfter");
    expect(readOrderSrc).toContain('p_chat_domain: "store_order"');
    expect(readOrderSrc).not.toContain("markOrderParticipantRead");
  });

  it("routes visible-range delivery cursor to OrderDomain scroll_ack only", () => {
    expect(readEffectSrc).toContain("isDeliveryOrderRoomSnapshot");
    expect(readEffectSrc).toContain('fetch("/api/domains/order/read-order-chat"');
    expect(scrollOrderBranch).toContain("postOrderChatRead(orderReadInput)");
    expect(scrollOrderBranch).toContain("path: \"scroll_ack\"");
    expect(readEffectSrc).not.toContain("runImmediateOpenFlushOnce");
  });

  it("scroll_ack: OrderDomain success applies only the visible cursor", () => {
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
    expect(readEffectSrc).toContain("!isDeliveryOrderRoomSnapshot(snapEarly)");
  });

  it("failure path keeps unread without Messenger fresh resync", () => {
    for (const branch of [scrollOrderBranch]) {
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

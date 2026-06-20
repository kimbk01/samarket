import { describe, expect, it } from "vitest";
import { resolveMessengerRoomMessagesAutoScroll } from "@/lib/community-messenger/room/messenger-room-messages-auto-scroll";
import { isMessengerRoomNearBottomFromMetrics } from "@/lib/community-messenger/room/messenger-room-timeline-ssot";
import {
  isMessengerEntryBottomLoadReason,
  isMessengerEntryTailSettleReason,
  resolveMessengerRoomEntryScrollPlan,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";
import { MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX } from "@/lib/ui/messenger-chat-viewport-tuning";

describe("messenger room scroll anchor policy", () => {
  it("near bottom threshold is 96px", () => {
    expect(MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX).toBe(96);
    expect(
      isMessengerRoomNearBottomFromMetrics(
        { scrollHeight: 1000, scrollTop: 904, clientHeight: 80 },
        MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX
      )
    ).toBe(true);
    expect(
      isMessengerRoomNearBottomFromMetrics(
        { scrollHeight: 1000, scrollTop: 800, clientHeight: 80 },
        MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX
      )
    ).toBe(false);
  });

  it("own message append always scrolls", () => {
    expect(
      resolveMessengerRoomMessagesAutoScroll({
        previousTailMessageId: "a",
        currentTailMessageId: "b",
        currentTailIsMine: true,
      }).reason
    ).toBe("own_message_append");
  });

  it("peer append is candidate only — tail unchanged skips", () => {
    expect(
      resolveMessengerRoomMessagesAutoScroll({
        previousTailMessageId: "m1",
        currentTailMessageId: "m1",
        currentTailIsMine: false,
      })
    ).toEqual({ scroll: false, reason: "skip_tail_unchanged" });
  });

  it("optimistic ack id replace does not scroll", () => {
    expect(
      resolveMessengerRoomMessagesAutoScroll({
        previousTailMessageId: "temp",
        currentTailMessageId: "server",
        currentTailIsMine: true,
        previousTailClientMessageId: "cid-1",
        currentTailClientMessageId: "cid-1",
      })
    ).toEqual({ scroll: false, reason: "skip_ack_id_replace" });
  });

  it("peer append candidate does not imply scroll without near-bottom gate", () => {
    const decision = resolveMessengerRoomMessagesAutoScroll({
      previousTailMessageId: "m1",
      currentTailMessageId: "m2",
      currentTailIsMine: false,
    });
    expect(decision.scroll).toBe(true);
    expect(decision.reason).toBe("peer_message_append");
  });

  it("push entry scroll plan ignores persisted restore", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({ intent: "push", hasPersisted: true }).reason
    ).toBe("push_entry_initial_load");
  });

  it("entry bottom load and tail settle reason helpers", () => {
    expect(isMessengerEntryBottomLoadReason("push_entry_initial_load")).toBe(true);
    expect(isMessengerEntryBottomLoadReason("initial_load")).toBe(true);
    expect(isMessengerEntryBottomLoadReason("room_entry_restore")).toBe(false);
    expect(isMessengerEntryTailSettleReason("push_entry_tail_settle")).toBe(true);
    expect(isMessengerEntryTailSettleReason("entry_tail_settle")).toBe(true);
    expect(isMessengerEntryTailSettleReason("composer_resize_keep_bottom")).toBe(false);
  });
});

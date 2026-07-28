/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCoalescedChatAlertSoundForTests,
  playCoalescedEventNotificationSound,
  playCoalescedOrderMatchChatAlert,
} from "@/lib/notifications/coalesced-chat-alert-sound";

vi.mock("@/lib/notifications/notification-sound-engine", () => ({
  playDomainNotificationSound: vi.fn().mockResolvedValue(undefined),
  playEventNotificationSound: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/play-order-match-alert", () => ({
  playOrderMatchChatAlert: vi.fn().mockResolvedValue(undefined),
}));

import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";
import { playOrderMatchChatAlert } from "@/lib/notifications/play-order-match-alert";

describe("order chat coalesced event keys", () => {
  beforeEach(() => {
    clearCoalescedChatAlertSoundForTests();
    vi.mocked(playEventNotificationSound).mockClear();
    vi.mocked(playOrderMatchChatAlert).mockClear();
  });

  it("match ack uses delivery_order_match_chat only", async () => {
    await playCoalescedOrderMatchChatAlert("msg:1:match-ack");
    expect(playOrderMatchChatAlert).toHaveBeenCalledTimes(1);
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });

  it("customer order message uses delivery_chat_message_received_user", () => {
    playCoalescedEventNotificationSound("msg:2:order-user", "delivery_chat_message_received_user");
    expect(playEventNotificationSound).toHaveBeenCalledWith("delivery_chat_message_received_user");
  });

  it("owner order message uses delivery_chat_message_received_owner", () => {
    playCoalescedEventNotificationSound("msg:3:order-owner", "delivery_chat_message_received_owner");
    expect(playEventNotificationSound).toHaveBeenCalledWith("delivery_chat_message_received_owner");
  });

  it("dedupes same key across paths", async () => {
    playCoalescedEventNotificationSound("same-key", "delivery_chat_message_received_user");
    await playCoalescedOrderMatchChatAlert("same-key");
    expect(playEventNotificationSound).toHaveBeenCalledTimes(1);
    expect(playOrderMatchChatAlert).not.toHaveBeenCalled();
  });
});

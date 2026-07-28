/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playMessengerMessageSentFeedbackOnce } from "@/lib/community-messenger/room/phase2/use-messenger-room-phase2-controller";
import { syncNotificationSoundGateSnapshot } from "@/lib/notifications/notification-sound-gate";

describe("playMessengerMessageSentFeedbackOnce — user sound gate", () => {
  beforeEach(() => {
    syncNotificationSoundGateSnapshot({
      userNotificationSettings: {
        trade_chat_enabled: true,
        community_chat_enabled: true,
        order_enabled: true,
        store_enabled: true,
        sound_enabled: true,
        vibration_enabled: true,
      },
      activeTradeChatRoomId: null,
      activeCommunityChatRoomId: null,
      activeGroupChatRoomId: null,
      isWindowFocused: true,
    });
  });

  it("plays messenger_message_sent once after successful ACK with confirmed id", () => {
    const play = vi.fn();
    const played = new Set<string>();

    expect(playMessengerMessageSentFeedbackOnce(played, "cid-1", "msg-1", play)).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("messenger_message_sent");
  });

  it("does not play before ACK (no confirmed id)", () => {
    const play = vi.fn();
    expect(playMessengerMessageSentFeedbackOnce(new Set(), "cid-1", null, play)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it("dedupes repeated ACK for the same clientMessageId", () => {
    const play = vi.fn();
    const played = new Set<string>();
    expect(playMessengerMessageSentFeedbackOnce(played, "cid-1", "msg-1", play)).toBe(true);
    expect(playMessengerMessageSentFeedbackOnce(played, "cid-1", "msg-1", play)).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not play when user sound_enabled is false", () => {
    syncNotificationSoundGateSnapshot({
      userNotificationSettings: {
        trade_chat_enabled: true,
        community_chat_enabled: true,
        order_enabled: true,
        store_enabled: true,
        sound_enabled: false,
        vibration_enabled: true,
      },
      activeTradeChatRoomId: null,
      activeCommunityChatRoomId: null,
      activeGroupChatRoomId: null,
      isWindowFocused: true,
    });
    const play = vi.fn();
    expect(playMessengerMessageSentFeedbackOnce(new Set(), "cid-2", "msg-2", play)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it("does not play when community_chat_enabled is false", () => {
    syncNotificationSoundGateSnapshot({
      userNotificationSettings: {
        trade_chat_enabled: true,
        community_chat_enabled: false,
        order_enabled: true,
        store_enabled: true,
        sound_enabled: true,
        vibration_enabled: true,
      },
      activeTradeChatRoomId: null,
      activeCommunityChatRoomId: null,
      activeGroupChatRoomId: null,
      isWindowFocused: true,
    });
    const play = vi.fn();
    expect(playMessengerMessageSentFeedbackOnce(new Set(), "cid-3", "msg-3", play)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });
});

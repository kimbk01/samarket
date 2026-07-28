/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearChatRoomMessageSoundMuteForTests,
  isChatRoomMessageSoundMuted,
  setChatRoomMessageSoundMuted,
} from "@/lib/chats/chat-room-message-sound-mute";
import {
  routeNotificationInsertSound,
  syncNotificationSoundGateSnapshot,
  type NotificationSoundGateSnapshot,
} from "@/lib/notifications/notification-sound-gate";
import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";

vi.mock("@/lib/notifications/notification-sound-engine", () => ({
  playEventNotificationSound: vi.fn(async () => {}),
}));

const DEFAULT_GATE: NotificationSoundGateSnapshot = {
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
};

describe("order room mute blocks INSERT sound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearChatRoomMessageSoundMuteForTests();
    syncNotificationSoundGateSnapshot({ ...DEFAULT_GATE });
    setChatRoomMessageSoundMuted("order-room-1", false);
  });

  it("blocks INSERT when room mute is ON", () => {
    setChatRoomMessageSoundMuted("order-room-1", true);
    expect(isChatRoomMessageSoundMuted("order-room-1")).toBe(true);

    const routed = routeNotificationInsertSound({
      id: "evt-order",
      notification_type: "chat",
      unread: true,
      domain: "store",
      ref_id: "order-room-1",
      meta: { kind: "store_order_message", room_id: "order-room-1", receiverRole: "user" },
    });

    expect(routed).toBe(false);
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });

  it("allows INSERT after mute OFF", () => {
    setChatRoomMessageSoundMuted("order-room-1", true);
    setChatRoomMessageSoundMuted("order-room-1", false);

    const routed = routeNotificationInsertSound({
      id: "evt-order-2",
      notification_type: "chat",
      unread: true,
      domain: "store",
      ref_id: "order-room-1",
      meta: { kind: "store_order_message", room_id: "order-room-1", receiverRole: "user" },
    });

    expect(routed).toBe(true);
    expect(playEventNotificationSound).toHaveBeenCalled();
  });

  it("blocks trade same-room via activeTradeChatRoomId even when path lag", () => {
    syncNotificationSoundGateSnapshot({
      ...DEFAULT_GATE,
      activeTradeChatRoomId: "trade-room-9",
    });

    const routed = routeNotificationInsertSound({
      id: "evt-trade",
      notification_type: "chat",
      unread: true,
      meta: { kind: "trade_chat", room_id: "trade-room-9" },
    });

    expect(routed).toBe(false);
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });
});

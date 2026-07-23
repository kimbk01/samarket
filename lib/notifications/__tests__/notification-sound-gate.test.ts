/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adaptNotificationEventInsertToLegacyRow } from "@/lib/notifications/adapt-notification-event-realtime-row";
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

describe("notification-sound-gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncNotificationSoundGateSnapshot({ ...DEFAULT_GATE });
  });

  it("routes friend_request_received through the same INSERT gate as badge", () => {
    const routed = routeNotificationInsertSound({
      id: "evt-friend",
      notification_type: "system",
      domain: "community_chat",
      ref_id: "req-1",
      unread: true,
      meta: { kind: "friend_request", request_id: "req-1" },
    });

    expect(routed).toBe(true);
    expect(playEventNotificationSound).toHaveBeenCalledTimes(1);
    expect(playEventNotificationSound).toHaveBeenCalledWith("friend_request_received");
  });

  it("blocks muted rows while leaving unread badge eligibility to the row", () => {
    const routed = routeNotificationInsertSound({
      id: "evt-muted",
      notification_type: "chat",
      unread: true,
      muted_snapshot: true,
      sound_suppressed_reason: "muted_room",
      meta: { kind: "community_chat", room_id: "room-1" },
    });

    expect(routed).toBe(false);
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });

  it("blocks any explicit sound_suppressed_reason from notification_events", () => {
    const row = adaptNotificationEventInsertToLegacyRow({
      id: "evt-suppressed",
      user_id: "user-b",
      type: "chat_message",
      category: "chat_message",
      title: "Sender",
      body: "hello",
      created_at: "2026-07-09T00:00:00.000Z",
      read_at: null,
      room_id: "room-1",
      dedupe_key: "msg:room-1:msg-1",
      display_payload: { roomKind: "direct", routeUrl: "/community-messenger/rooms/room-1" },
      muted_snapshot: false,
      sound_suppressed_reason: "same_room_foreground",
    });

    const routed = routeNotificationInsertSound(row);

    expect(row.sound_suppressed_reason).toBe("same_room_foreground");
    expect(routed).toBe(false);
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });

  it("plays one sound for a normal direct message INSERT", () => {
    const routed = routeNotificationInsertSound({
      id: "evt-direct",
      notification_type: "chat",
      unread: true,
      sound_suppressed_reason: null,
      meta: { kind: "community_chat", room_id: "room-2" },
    });

    expect(routed).toBe(true);
    expect(playEventNotificationSound).toHaveBeenCalledTimes(1);
    expect(playEventNotificationSound).toHaveBeenCalledWith("messenger_direct_message_received");
  });

  it("keeps active same-room foreground suppression", () => {
    syncNotificationSoundGateSnapshot({
      ...DEFAULT_GATE,
      activeCommunityChatRoomId: "room-2",
    });

    const routed = routeNotificationInsertSound({
      id: "evt-direct",
      notification_type: "chat",
      unread: false,
      meta: { kind: "community_chat", room_id: "room-2" },
    });

    expect(routed).toBe(false);
    expect(playEventNotificationSound).not.toHaveBeenCalled();
  });

  it("suppresses INSERT sound from window pathname when gate activeRoom is still null", () => {
    const prevPath = window.location.pathname;
    window.history.pushState({}, "", "/community-messenger/rooms/room-enter");
    syncNotificationSoundGateSnapshot({ ...DEFAULT_GATE, activeCommunityChatRoomId: null });

    const routed = routeNotificationInsertSound({
      id: "evt-late-insert",
      notification_type: "chat",
      unread: true,
      sound_suppressed_reason: null,
      meta: { kind: "community_chat", room_id: "room-enter" },
    });

    expect(routed).toBe(false);
    expect(playEventNotificationSound).not.toHaveBeenCalled();
    window.history.pushState({}, "", prevPath || "/");
  });
});

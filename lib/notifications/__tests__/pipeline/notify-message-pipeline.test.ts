import { beforeEach, describe, expect, it, vi } from "vitest";

const createAndDispatchNotificationEvent = vi.fn();
const isNotificationBlockedForRecipient = vi.fn();
const isRoomMutedForUser = vi.fn();
const loadRecipientPresenceSnapshot = vi.fn();
const resolvePresenceSuppressDecision = vi.fn();
const resolveOsPushAppStateFromPresence = vi.fn();
const markRoomRead = vi.fn();
const invalidateNotificationBadgeCache = vi.fn();
const loadNotificationUserLanguage = vi.fn();

vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: (...args: unknown[]) =>
    createAndDispatchNotificationEvent(...args),
}));

vi.mock("@/lib/notifications/policy/notification-block-policy", () => ({
  isNotificationBlockedForRecipient: (...args: unknown[]) => isNotificationBlockedForRecipient(...args),
}));

vi.mock("@/lib/notifications/policy/notification-mute-policy", () => ({
  isRoomMutedForUser: (...args: unknown[]) => isRoomMutedForUser(...args),
}));

vi.mock("@/lib/notifications/policy/notification-presence-policy", () => ({
  loadRecipientPresenceSnapshot: (...args: unknown[]) => loadRecipientPresenceSnapshot(...args),
  resolvePresenceSuppressDecision: (...args: unknown[]) => resolvePresenceSuppressDecision(...args),
  resolveOsPushAppStateFromPresence: (...args: unknown[]) => resolveOsPushAppStateFromPresence(...args),
}));

vi.mock("@/lib/notifications/pipeline/notify-read-service", () => ({
  markRoomRead: (...args: unknown[]) => markRoomRead(...args),
}));

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  invalidateNotificationBadgeCache: (...args: unknown[]) => invalidateNotificationBadgeCache(...args),
}));

vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: (...args: unknown[]) => loadNotificationUserLanguage(...args),
}));

const loadMessageNotificationDisplaySharedContext = vi.fn();
const buildRecipientMessageNotificationDisplay = vi.fn();

vi.mock("@/lib/notifications/display/load-message-notification-display-context", () => ({
  loadMessageNotificationDisplaySharedContext: (...args: unknown[]) =>
    loadMessageNotificationDisplaySharedContext(...args),
  buildRecipientMessageNotificationDisplay: (...args: unknown[]) =>
    buildRecipientMessageNotificationDisplay(...args),
}));

import { notifyMessagePipeline } from "@/lib/notifications/pipeline/notify-message-pipeline";

const sb = {} as never;

function storeOrderRoleSupabase(rows: Array<{ user_id: string; role: string }>, error: unknown = null) {
  const inMock = vi.fn(async () => ({ data: rows, error }));
  const eqMock = vi.fn(() => ({ in: inMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return {
    client: { from: fromMock } as never,
    fromMock,
    selectMock,
    eqMock,
    inMock,
  };
}

function defaultPresenceDecision(overrides: Record<string, unknown> = {}) {
  return {
    suppressPush: false,
    suppressSound: false,
    suppressBadge: false,
    autoRead: false,
    reason: null,
    ...overrides,
  };
}

describe("notify-message-pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNotificationBlockedForRecipient.mockResolvedValue(false);
    isRoomMutedForUser.mockResolvedValue(false);
    loadRecipientPresenceSnapshot.mockResolvedValue({
      appVisibility: "background",
      activeRoomId: null,
      lastPingAtMs: null,
    });
    resolvePresenceSuppressDecision.mockReturnValue(defaultPresenceDecision());
    resolveOsPushAppStateFromPresence.mockReturnValue("background");
    loadNotificationUserLanguage.mockResolvedValue("ko");
    loadMessageNotificationDisplaySharedContext.mockResolvedValue({
      resolvedRoomKind: "direct",
      messageType: "text",
      textContent: "hello",
      sender: { displayName: "sender-a", avatarUrl: null },
      room: { name: null, contextLabel: null },
      chatPreviewByUserId: new Map([["user-b", true]]),
    });
    buildRecipientMessageNotificationDisplay.mockImplementation(async (_sb, input) => ({
      senderName: "sender-a",
      senderAvatarUrl: null,
      roomKind: input.roomKind ?? "direct",
      roomName: input.roomKind === "group" ? "group-room" : null,
      contextLabel: null,
      previewText: input.preview ?? "hello",
      previewKind: "text",
      privacyRedacted: false,
      routeUrl: `/community-messenger/rooms/${input.roomId}`,
      title: input.roomKind === "group" ? "group-room" : "sender-a",
      body: input.roomKind === "group" ? `sender-a: ${input.preview ?? "hello"}` : input.preview ?? "hello",
    }));
    createAndDispatchNotificationEvent.mockResolvedValue({
      ok: true,
      row: { id: "evt-1", user_id: "user-b", push_suppressed_reason: null, display_payload: {} },
    });
    markRoomRead.mockResolvedValue(0);
  });

  it("creates event and dispatches push for normal recipient", async () => {
    await notifyMessagePipeline(sb, {
      roomId: "room-1",
      messageId: "msg-1",
      senderUserId: "user-a",
      recipientUserIds: ["user-b"],
      preview: "hello",
      roomKind: "direct",
    });
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledTimes(1);
  });

  it("creates group_message event when roomKind is group", async () => {
    await notifyMessagePipeline(sb, {
      roomId: "room-g1",
      messageId: "msg-g1",
      senderUserId: "user-a",
      recipientUserIds: ["user-b"],
      preview: "group hello",
      roomKind: "group",
    });
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        type: "group_message",
        category: "group_message",
        roomId: "room-g1",
        messageId: "msg-g1",
      })
    );
  });

  it("skips blocked recipient without creating event", async () => {
    isNotificationBlockedForRecipient.mockResolvedValue(true);
    await notifyMessagePipeline(sb, {
      roomId: "room-1",
      messageId: "msg-1",
      senderUserId: "user-a",
      recipientUserIds: ["user-b"],
      preview: "hello",
    });
    expect(createAndDispatchNotificationEvent).not.toHaveBeenCalled();
  });

  it("creates event with muted suppress reasons but still inserts", async () => {
    isRoomMutedForUser.mockResolvedValue(true);
    await notifyMessagePipeline(sb, {
      roomId: "room-1",
      messageId: "msg-1",
      senderUserId: "user-a",
      recipientUserIds: ["user-b"],
      preview: "hello",
    });
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        pushSuppressedReason: "muted_room",
        soundSuppressedReason: "muted_room",
      })
    );
  });

  it("auto-reads and suppresses push for same-room foreground", async () => {
    resolvePresenceSuppressDecision.mockReturnValue(
      defaultPresenceDecision({
        suppressPush: true,
        suppressSound: true,
        suppressBadge: true,
        autoRead: true,
        reason: "same_room_foreground",
      })
    );
    await notifyMessagePipeline(sb, {
      roomId: "room-1",
      messageId: "msg-1",
      senderUserId: "user-a",
      recipientUserIds: ["user-b"],
      preview: "hello",
    });
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ unread: false, pushSuppressedReason: "same_room_foreground" })
    );
    expect(markRoomRead).toHaveBeenCalledWith(sb, "user-b", "room-1");
  });

  it("creates separate events for consecutive messages", async () => {
    createAndDispatchNotificationEvent
      .mockResolvedValueOnce({ ok: true, row: { id: "evt-1", user_id: "user-b" } })
      .mockResolvedValueOnce({ ok: true, row: { id: "evt-2", user_id: "user-b" } });
    await notifyMessagePipeline(sb, {
      roomId: "room-1",
      messageId: "msg-1",
      senderUserId: "user-a",
      recipientUserIds: ["user-b"],
      preview: "one",
    });
    await notifyMessagePipeline(sb, {
      roomId: "room-1",
      messageId: "msg-2",
      senderUserId: "user-a",
      recipientUserIds: ["user-b"],
      preview: "two",
    });
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledTimes(2);
  });

  it("preserves owner/user receiverRole for store order message recipients", async () => {
    const roleDb = storeOrderRoleSupabase([
      { user_id: "owner-user", role: "owner" },
      { user_id: "buyer-user", role: "member" },
    ]);

    await notifyMessagePipeline(roleDb.client, {
      roomId: "store-room-1",
      messageId: "msg-store-1",
      senderUserId: "sender-user",
      recipientUserIds: ["owner-user", "buyer-user"],
      preview: "store hello",
      roomKind: "store_order",
    });

    expect(roleDb.fromMock).toHaveBeenCalledWith("community_messenger_participants");
    expect(roleDb.selectMock).toHaveBeenCalledWith("user_id, role");
    expect(roleDb.eqMock).toHaveBeenCalledWith("room_id", "store-room-1");
    expect(roleDb.inMock).toHaveBeenCalledWith("user_id", ["owner-user", "buyer-user"]);
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledWith(
      roleDb.client,
      expect.objectContaining({
        userId: "owner-user",
        type: "store_order_message",
        displayPayload: expect.objectContaining({
          receiverRole: "owner",
          legacyMeta: { kind: "store_order_message", receiverRole: "owner" },
        }),
      })
    );
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledWith(
      roleDb.client,
      expect.objectContaining({
        userId: "buyer-user",
        type: "store_order_message",
        displayPayload: expect.objectContaining({
          receiverRole: "user",
          legacyMeta: { kind: "store_order_message", receiverRole: "user" },
        }),
      })
    );
  });

  it("keeps store order payload fallback when receiver role lookup has no match", async () => {
    const roleDb = storeOrderRoleSupabase([]);

    await notifyMessagePipeline(roleDb.client, {
      roomId: "store-room-1",
      messageId: "msg-store-2",
      senderUserId: "sender-user",
      recipientUserIds: ["unknown-user"],
      preview: "store hello",
      roomKind: "store_order",
    });

    expect(createAndDispatchNotificationEvent).toHaveBeenCalledWith(
      roleDb.client,
      expect.objectContaining({
        userId: "unknown-user",
        type: "store_order_message",
        displayPayload: expect.not.objectContaining({
          receiverRole: expect.any(String),
        }),
      })
    );
  });
});

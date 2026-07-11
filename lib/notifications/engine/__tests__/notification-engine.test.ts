import { describe, expect, it, vi } from "vitest";
import { createNotificationDecision } from "@/lib/notifications/engine/notification-decision";
import { runNotificationEngine } from "@/lib/notifications/engine/notification-engine";
import { evaluateNotificationEngineDecision } from "@/lib/notifications/engine/notification-engine-policy";

vi.mock("@/lib/notifications/policy/notification-mute-policy", () => ({
  isRoomMutedForUser: vi.fn(async () => false),
}));

vi.mock("@/lib/notifications/policy/notification-presence-policy", () => ({
  loadRecipientPresenceSnapshot: vi.fn(async () => ({
    appVisibility: "background",
    activeRoomId: null,
    lastPingAtMs: null,
  })),
  resolvePresenceSuppressDecision: vi.fn(() => ({
    suppressPush: false,
    suppressSound: false,
    suppressBadge: false,
    autoRead: false,
    reason: null,
  })),
}));

describe("notification-engine phase2", () => {
  it("MessageCreated direct → CHAT_MESSAGE_CREATED + Decision", async () => {
    const result = await runNotificationEngine({
      kind: "message_created",
      messageId: "msg-1",
      roomId: "room-1",
      senderUserId: "sender",
      recipientUserId: "recipient",
      createdAt: "2026-07-10T00:00:00.000Z",
      roomKind: "direct",
    });

    expect(result?.event.type).toBe("CHAT_MESSAGE_CREATED");
    expect(result?.event.userId).toBe("recipient");
    expect(result?.decision.playSound).toBe(true);
    expect(result?.decision.showBottomBadge).toBe(true);
    expect(result?.decision.showListBadge).toBe(true);
    expect(result?.decision.push).toBe(true);
    expect(result?.decision.persist).toBe(true);
  });

  it("MessageCreated group → GROUP_MESSAGE_CREATED", async () => {
    const result = await runNotificationEngine({
      kind: "message_created",
      messageId: "msg-2",
      roomId: "room-2",
      senderUserId: "sender",
      recipientUserId: "recipient",
      createdAt: "2026-07-10T00:00:00.000Z",
      roomKind: "group",
    });

    expect(result?.event.type).toBe("GROUP_MESSAGE_CREATED");
  });

  it("RoomRead direct → CHAT_ROOM_READ + clear Decision", async () => {
    const result = await runNotificationEngine({
      kind: "room_read",
      roomId: "room-1",
      userId: "reader",
      readAt: "2026-07-10T00:01:00.000Z",
      lastReadMessageId: "msg-1",
      roomKind: "direct",
    });

    expect(result?.event.type).toBe("CHAT_ROOM_READ");
    expect(result?.decision.playSound).toBe(false);
    expect(result?.decision.showBottomBadge).toBe(true);
    expect(result?.decision.showListBadge).toBe(true);
    expect(result?.decision.push).toBe(false);
    expect(result?.decision.persist).toBe(true);
  });

  it("RoomRead group → GROUP_ROOM_READ", async () => {
    const result = await runNotificationEngine({
      kind: "room_read",
      roomId: "room-g",
      userId: "reader",
      readAt: "2026-07-10T00:01:00.000Z",
      roomKind: "group",
    });

    expect(result?.event.type).toBe("GROUP_ROOM_READ");
  });

  it("Policy same-room foreground suppresses sound and badges on create", async () => {
    const { resolvePresenceSuppressDecision } = await import(
      "@/lib/notifications/policy/notification-presence-policy"
    );
    vi.mocked(resolvePresenceSuppressDecision).mockReturnValueOnce({
      suppressPush: true,
      suppressSound: true,
      suppressBadge: true,
      autoRead: true,
      reason: "same_room_foreground",
    });

    const decision = await evaluateNotificationEngineDecision(
      {
        kind: "message_created",
        messageId: "m",
        roomId: "r",
        senderUserId: "s",
        recipientUserId: "u",
        createdAt: "2026-07-10T00:00:00.000Z",
        roomKind: "direct",
      },
      { sb: {} as never }
    );

    expect(decision.playSound).toBe(false);
    expect(decision.showBottomBadge).toBe(false);
    expect(decision.showListBadge).toBe(false);
    expect(decision.push).toBe(false);
    expect(decision.suppressReasons).toContain("same_room_foreground");
  });

  it("T0 decisionSnapshot skips mute/presence re-evaluation", async () => {
    const { loadRecipientPresenceSnapshot, resolvePresenceSuppressDecision } = await import(
      "@/lib/notifications/policy/notification-presence-policy"
    );
    const { isRoomMutedForUser } = await import("@/lib/notifications/policy/notification-mute-policy");
    vi.mocked(loadRecipientPresenceSnapshot).mockClear();
    vi.mocked(resolvePresenceSuppressDecision).mockClear();
    vi.mocked(isRoomMutedForUser).mockClear();

    const snapshot = createNotificationDecision({
      playSound: false,
      showBottomBadge: false,
      showListBadge: false,
      push: false,
      persist: true,
      suppressReasons: ["same_room_foreground", "auto_read_same_room"],
    });

    const decision = await evaluateNotificationEngineDecision(
      {
        kind: "message_created",
        messageId: "m",
        roomId: "r",
        senderUserId: "s",
        recipientUserId: "u",
        createdAt: "2026-07-10T00:00:00.000Z",
        roomKind: "direct",
        decisionSnapshot: snapshot,
      },
      { sb: {} as never }
    );

    expect(decision).toEqual(snapshot);
    expect(vi.mocked(loadRecipientPresenceSnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(resolvePresenceSuppressDecision)).not.toHaveBeenCalled();
    expect(vi.mocked(isRoomMutedForUser)).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { createNotificationDecision } from "@/lib/notifications/engine/notification-decision";
import type { ChatMessageCreatedNotificationEvent } from "@/lib/notifications/engine/notification-event";
import {
  appendNotificationEventLog,
  getNotificationEventLogSnapshot,
  resetNotificationEventLogForTests,
} from "@/lib/notifications/engine/notification-event-log";
import { buildEnginePersistencePlan } from "@/lib/notifications/engine/persistence/engine-persistence-plan";
import { buildLegacyMessageCreatedEventPersistencePlan } from "@/lib/notifications/engine/persistence/legacy-message-persistence-plan";
import { buildLegacyRoomReadPersistencePlan } from "@/lib/notifications/engine/persistence/legacy-room-read-persistence-plan";
import { comparePersistencePlans } from "@/lib/notifications/engine/persistence/persistence-shadow-compare";

const baseMessageEvent = (): ChatMessageCreatedNotificationEvent => ({
  eventId: "msg-1:recipient-1",
  type: "CHAT_MESSAGE_CREATED",
  roomId: "room-1",
  userId: "recipient-1",
  messageId: "msg-1",
  senderUserId: "sender-1",
  roomKind: "direct",
  createdAt: "2026-07-10T00:00:00.000Z",
  decision: createNotificationDecision({
    playSound: true,
    showBottomBadge: true,
    showListBadge: true,
    push: true,
    persist: true,
    suppressReasons: [],
  }),
});

describe("notification-event-log phase3-1", () => {
  it("append increases monotonic seq", async () => {
    resetNotificationEventLogForTests();
    const event = baseMessageEvent();
    const first = await appendNotificationEventLog(event);
    const second = await appendNotificationEventLog(event);
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(getNotificationEventLogSnapshot()).toHaveLength(2);
  });
});

describe("persistence shadow compare phase3-1", () => {
  it("PASS when legacy and engine message event plans match", () => {
    const legacyPlan = {
      operations: [
        {
          kind: "create_notification_event" as const,
          userId: "recipient-1",
          roomId: "room-1",
          messageId: "msg-1",
          eventType: "chat_message",
          dedupeKey: "msg:room-1:msg-1",
          unread: true,
          mutedSnapshot: false,
          pushSuppressedReason: null,
          soundSuppressedReason: null,
        },
      ],
    };
    const enginePlan = buildEnginePersistencePlan(baseMessageEvent(), "message_event");
    const result = comparePersistencePlans(legacyPlan, enginePlan);
    expect(result.match).toBe(true);
    expect(result.legacyOnly).toEqual([]);
    expect(result.engineOnly).toEqual([]);
  });

  it("STOP when unread flag differs", () => {
    const legacyPlan = {
      operations: [
        {
          kind: "create_notification_event" as const,
          userId: "recipient-1",
          roomId: "room-1",
          messageId: "msg-1",
          eventType: "chat_message",
          dedupeKey: "msg:room-1:msg-1",
          unread: false,
          mutedSnapshot: false,
          pushSuppressedReason: "same_room_foreground",
          soundSuppressedReason: "same_room_foreground",
        },
      ],
    };
    const enginePlan = buildEnginePersistencePlan(baseMessageEvent(), "message_event");
    const result = comparePersistencePlans(legacyPlan, enginePlan);
    expect(result.match).toBe(false);
    expect(result.legacyOnly.length + result.engineOnly.length).toBeGreaterThan(0);
  });

  it("target bump plan matches for general direct/group", () => {
    const legacyPlan = {
      operations: [
        {
          kind: "bump_notification_target" as const,
          userId: "recipient-1",
          roomId: "room-1",
          targetType: "chat_room",
          targetId: "room-1",
          scope: "consumer",
        },
      ],
    };
    const enginePlan = buildEnginePersistencePlan(baseMessageEvent(), "message_target");
    expect(comparePersistencePlans(legacyPlan, enginePlan).match).toBe(true);
  });

  it("room read mark_read patch clears chat_room target only", () => {
    const legacyPlan = buildLegacyRoomReadPersistencePlan({
      userId: "reader",
      roomId: "room-1",
      scope: "mark_read_patch",
    });
    const event = {
      eventId: "room-1:reader:read",
      type: "CHAT_ROOM_READ" as const,
      roomId: "room-1",
      userId: "reader",
      roomKind: "direct" as const,
      createdAt: "2026-07-10T00:01:00.000Z",
      decision: createNotificationDecision({
        playSound: false,
        showBottomBadge: true,
        showListBadge: true,
        push: false,
        persist: true,
      }),
    };
    const enginePlan = buildEnginePersistencePlan(event, "room_read", "mark_read_patch");
    expect(comparePersistencePlans(legacyPlan, enginePlan).match).toBe(true);
  });
});

describe("legacy message persistence plan builder", () => {
  it("returns null for empty recipient", async () => {
    const plan = await buildLegacyMessageCreatedEventPersistencePlan({} as never, {
      roomId: "room-1",
      messageId: "msg-1",
      senderUserId: "sender",
      recipientUserId: "",
      roomKind: "direct",
    });
    expect(plan).toBeNull();
  });
});

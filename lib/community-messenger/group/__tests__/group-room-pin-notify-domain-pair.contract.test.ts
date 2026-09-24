/**
 * T1–T9 — pin_message minimum repair: GROUP domain pair on createNotificationEvent.
 * Does not change group_message / mention_message contracts.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { groupRoomIdentity } from "@/lib/chat-domain/room-identity";

const ROOM = "3e92fa77-de94-493b-b2e2-eb4813228d39";
const MSG = "a6966aa7-f41e-44d2-93ba-5574517cb0ba";
const ACTOR = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
const R1 = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const R2 = "11111111-1111-1111-1111-111111111111";
const R3 = "22222222-2222-2222-2222-222222222222";

const createNotificationEvent = vi.fn();
const dispatchNotificationPushIfAllowed = vi.fn();
const loadNotificationUserLanguage = vi.fn();

vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  createNotificationEvent: (...args: unknown[]) => createNotificationEvent(...args),
}));
vi.mock("@/lib/notifications/pipeline/notify-push-dispatcher", () => ({
  dispatchNotificationPushIfAllowed: (...args: unknown[]) =>
    dispatchNotificationPushIfAllowed(...args),
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: (...args: unknown[]) => loadNotificationUserLanguage(...args),
}));
vi.mock("@/lib/notifications/notify-safe-translate", () => ({
  notifySafeT: (_lang: string, key: string) => key,
}));
vi.mock("@/lib/notifications/core/notification-policy", () => ({
  categoryForEventType: () => "message",
}));

function mockSb(participantIds: string[]) {
  return {
    from: (table: string) => {
      if (table !== "community_messenger_participants") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              is: async () => ({
                data: participantIds.map((user_id) => ({ user_id })),
                error: null,
              }),
            }),
          }),
        }),
      };
    },
  } as never;
}

describe("notifyGroupPinMessage — GROUP domain pair", () => {
  beforeEach(() => {
    createNotificationEvent.mockReset();
    dispatchNotificationPushIfAllowed.mockReset();
    loadNotificationUserLanguage.mockReset();
    createNotificationEvent.mockResolvedValue({ ok: true, row: { id: "evt" } });
    dispatchNotificationPushIfAllowed.mockResolvedValue(undefined);
    loadNotificationUserLanguage.mockResolvedValue("ko");
  });

  it("T1–T7: domain pair, recipients, ON/OFF dedupe", async () => {
    const { notifyGroupPinMessage } = await import(
      "@/lib/community-messenger/group/group-room-pin-notify"
    );
    const expected = groupRoomIdentity(ROOM);
    const sb = mockSb([ACTOR, R1, R2, R3]);

    await notifyGroupPinMessage(sb, {
      roomId: ROOM,
      actorUserId: ACTOR,
      messageId: MSG,
      pinned: true,
    });

    const onCalls = createNotificationEvent.mock.calls.map(
      (c) => (c as unknown as [unknown, Record<string, unknown>])[1]
    );
    expect(onCalls).toHaveLength(3);

    // T1
    for (const payload of onCalls) {
      expect(payload.chatDomain).toBe("group");
    }
    // T2
    for (const payload of onCalls) {
      expect(payload.domainIdentityKey).toBe(expected.identityKey);
      expect(String(payload.domainIdentityKey)).toMatch(/^group:/);
    }
    // T3
    for (const payload of onCalls) {
      expect(payload.domainIdentityKey).toBe(`group:${ROOM}`);
      expect(payload.roomId).toBe(ROOM);
    }
    // T4 actor excluded
    const recipientIds = onCalls.map((p) => p.userId);
    expect(recipientIds).not.toContain(ACTOR);
    // T5 other participants remain
    expect(recipientIds.sort()).toEqual([R1, R2, R3].sort());
    // T6 ON dedupe stable
    for (const payload of onCalls) {
      expect(payload.dedupeKey).toBe(
        `pin:${ROOM}:${MSG}:on:${payload.userId}`
      );
      expect(payload.type).toBe("pin_message");
    }

    createNotificationEvent.mockClear();
    await notifyGroupPinMessage(sb, {
      roomId: ROOM,
      actorUserId: ACTOR,
      messageId: MSG,
      pinned: false,
    });
    const offCalls = createNotificationEvent.mock.calls.map(
      (c) => (c as unknown as [unknown, Record<string, unknown>])[1]
    );
    expect(offCalls).toHaveLength(3);
    // T7 OFF distinct from ON
    for (const payload of offCalls) {
      expect(payload.dedupeKey).toBe(
        `pin:${ROOM}:${MSG}:off:${payload.userId}`
      );
      expect(payload.dedupeKey).not.toContain(":on:");
      expect(payload.chatDomain).toBe("group");
      expect(payload.domainIdentityKey).toBe(`group:${ROOM}`);
    }
  });

  it("T8: existing group_message notify path still uses groupRoomIdentity", () => {
    const pipeline = readFileSync(
      resolve(process.cwd(), "lib/notifications/pipeline/notify-message-pipeline.ts"),
      "utf8"
    );
    expect(pipeline).toContain("groupRoomIdentity");
    expect(pipeline).toMatch(/kind === "group"/);
    expect(pipeline).toContain("chatDomain: domainPair.chatDomain");
    expect(pipeline).toContain("domainIdentityKey: domainPair.domainIdentityKey");
  });

  it("T9: mention_message service source unchanged by this repair", () => {
    const mention = readFileSync(
      resolve(process.cwd(), "lib/community-messenger/group/group-room-mention-service.ts"),
      "utf8"
    );
    // mention resolver must still omit full_name (prior lock)
    expect(mention).not.toMatch(/full_name/);
    const pin = readFileSync(
      resolve(process.cwd(), "lib/community-messenger/group/group-room-pin-notify.ts"),
      "utf8"
    );
    expect(pin).toContain("groupRoomIdentity");
    expect(pin).toContain("chatDomain: domain.domain");
    expect(pin).toContain("domainIdentityKey: domain.identityKey");
  });
});

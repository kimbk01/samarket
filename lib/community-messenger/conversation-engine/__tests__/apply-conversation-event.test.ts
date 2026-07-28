import { describe, expect, it } from "vitest";
import { applyConversationEvent } from "@/lib/community-messenger/conversation-engine/apply-conversation-event";
import { ConversationStore } from "@/lib/community-messenger/conversation-engine/conversation-store";
import { sortConversations } from "@/lib/community-messenger/conversation-engine/sort";
import type {
  ConversationSummary,
  ConversationUpsertEvent,
} from "@/lib/community-messenger/conversation-engine/types";

function baseConv(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    conversationId: "room-a",
    roomId: "room-a",
    domain: "general_direct",
    domainIdentityKey: null,
    title: "A",
    subtitle: "",
    avatarUrl: null,
    unreadCount: 0,
    isMuted: false,
    isPinned: false,
    isArchivedByViewer: false,
    isBlockedHiddenByViewer: false,
    lastActivityAt: "2026-07-29T10:00:00.000Z",
    preview: { kind: "text", text: "hello", messageId: "m1" },
    revision: Date.parse("2026-07-29T10:00:00.000Z"),
    roomType: "direct",
    roomStatus: "active",
    peerUserId: null,
    messengerDirectKey: null,
    ...overrides,
  };
}

function upsert(overrides: Partial<ConversationUpsertEvent> = {}): ConversationUpsertEvent {
  return {
    type: "conversation_upsert",
    eventId: "evt-1",
    conversationId: "room-a",
    roomId: "room-a",
    domain: "general_direct",
    lastActivityAt: "2026-07-29T10:01:00.000Z",
    revision: Date.parse("2026-07-29T10:01:00.000Z"),
    preview: { kind: "text", text: "world", messageId: "m2" },
    ...overrides,
  };
}

describe("applyConversationEvent", () => {
  it("duplicate eventId → same state reference", () => {
    const rows = [baseConv()];
    const seen = new Set(["evt-1"]);
    const result = applyConversationEvent(rows, upsert(), { seenEventIds: seen });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("duplicate_event_id");
    expect(result.next).toBe(rows);
  });

  it("stale revision → drop", () => {
    const rows = [baseConv({ revision: 2000 })];
    const result = applyConversationEvent(
      rows,
      upsert({ revision: 1000, lastActivityAt: "2026-07-29T11:00:00.000Z" })
    );
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("stale_revision");
    expect(result.next).toBe(rows);
  });

  it("stale activityAt → drop", () => {
    const rows = [baseConv({ lastActivityAt: "2026-07-29T12:00:00.000Z", revision: 1 })];
    const result = applyConversationEvent(
      rows,
      upsert({
        lastActivityAt: "2026-07-29T11:00:00.000Z",
        revision: 2,
      })
    );
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("stale_activity");
  });

  it("one conversation object change; others same reference", () => {
    const a = baseConv();
    const b = baseConv({ conversationId: "room-b", roomId: "room-b", title: "B" });
    const rows = [a, b];
    const result = applyConversationEvent(rows, upsert());
    expect(result.applied).toBe(true);
    expect(result.next[1]).toBe(b);
    expect(result.next[0]).not.toBe(a);
    expect(result.next[0]!.preview.text).toBe("world");
  });

  it("equal payload → same array reference", () => {
    const rows = [
      baseConv({
        lastActivityAt: "2026-07-29T10:01:00.000Z",
        revision: Date.parse("2026-07-29T10:01:00.000Z"),
        preview: { kind: "text", text: "world", messageId: "m2" },
      }),
    ];
    const result = applyConversationEvent(rows, upsert());
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("equal_payload");
    expect(result.next).toBe(rows);
  });

  it("domain mismatch → drop", () => {
    const rows = [baseConv({ domain: "trade" })];
    const result = applyConversationEvent(rows, upsert({ domain: "general_direct" }));
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("domain_mismatch");
  });

  it("call terminal cannot be overwritten by dialing replay", () => {
    const rows = [
      baseConv({
        preview: {
          kind: "call",
          text: "통화 종료",
          callStatus: "ended",
          sessionId: "s1",
        },
        lastActivityAt: "2026-07-29T10:05:00.000Z",
        revision: Date.parse("2026-07-29T10:05:00.000Z"),
      }),
    ];
    const result = applyConversationEvent(
      rows,
      upsert({
        eventId: "call-dial",
        lastActivityAt: "2026-07-29T10:05:00.000Z",
        revision: Date.parse("2026-07-29T10:05:00.000Z"),
        preview: {
          kind: "call",
          text: "전화 거는 중",
          callStatus: "dialing",
          sessionId: "s1",
        },
      })
    );
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("call_terminal_guard");
  });

  it("conversation_read updates unread only", () => {
    const rows = [baseConv({ unreadCount: 3 })];
    const result = applyConversationEvent(rows, {
      type: "conversation_read",
      eventId: "read-1",
      conversationId: "room-a",
      roomId: "room-a",
      domain: "general_direct",
      unreadCount: 0,
    });
    expect(result.applied).toBe(true);
    expect(result.next[0]!.unreadCount).toBe(0);
    expect(result.next[0]!.preview.text).toBe("hello");
  });
});

describe("sortConversations", () => {
  it("pinned first then lastActivityAt DESC", () => {
    const rows = sortConversations([
      baseConv({
        conversationId: "c",
        roomId: "c",
        lastActivityAt: "2026-07-29T09:00:00.000Z",
        isPinned: false,
      }),
      baseConv({
        conversationId: "b",
        roomId: "b",
        lastActivityAt: "2026-07-29T11:00:00.000Z",
        isPinned: false,
      }),
      baseConv({
        conversationId: "a",
        roomId: "a",
        lastActivityAt: "2026-07-29T08:00:00.000Z",
        isPinned: true,
      }),
    ]);
    expect(rows.map((r) => r.conversationId)).toEqual(["a", "b", "c"]);
  });
});

describe("ConversationStore", () => {
  it("seed + apply + hub selector excludes trade", () => {
    const store = new ConversationStore();
    store.seedConversations([
      baseConv(),
      baseConv({
        conversationId: "trade-1",
        roomId: "trade-1",
        domain: "trade",
        title: "Trade",
      }),
    ]);
    expect(store.selectHubConversations()).toHaveLength(1);
    expect(store.selectTrade()).toHaveLength(1);
    store.applyEvent(
      upsert({
        eventId: "e2",
        lastActivityAt: "2026-07-29T12:00:00.000Z",
        revision: Date.parse("2026-07-29T12:00:00.000Z"),
        preview: { kind: "text", text: "later", messageId: "m9" },
      })
    );
    expect(store.getConversations()[0]!.preview.text).toBe("later");
  });
});

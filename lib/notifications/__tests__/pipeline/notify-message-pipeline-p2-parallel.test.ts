import { beforeEach, describe, expect, it, vi } from "vitest";

/** P2 (2026-11-18) — notifyMessagePipeline opt-in: parallelRecipients · deferAutoRead */
const createAndDispatchNotificationEvent = vi.fn();
const isNotificationBlockedForRecipient = vi.fn();
const isRoomMutedForUser = vi.fn();
const loadRecipientPresenceSnapshot = vi.fn();
const resolvePresenceSuppressDecision = vi.fn();
const resolveOsPushAppStateFromPresence = vi.fn();
const markRoomRead = vi.fn();
const invalidateNotificationBadgeCache = vi.fn();
const loadNotificationUserLanguage = vi.fn();
const loadMessageNotificationDisplaySharedContext = vi.fn();
const buildRecipientMessageNotificationDisplay = vi.fn();

vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: (...args: unknown[]) => createAndDispatchNotificationEvent(...args),
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
vi.mock("@/lib/notifications/display/load-message-notification-display-context", () => ({
  loadMessageNotificationDisplaySharedContext: (...args: unknown[]) =>
    loadMessageNotificationDisplaySharedContext(...args),
  buildRecipientMessageNotificationDisplay: (...args: unknown[]) => buildRecipientMessageNotificationDisplay(...args),
}));

import { notifyMessagePipeline } from "@/lib/notifications/pipeline/notify-message-pipeline";

const sb = {} as never;

function presenceDecision(overrides: Record<string, unknown> = {}) {
  return { suppressPush: false, suppressSound: false, suppressBadge: false, autoRead: false, reason: null, ...overrides };
}

const autoReadDecision = presenceDecision({
  suppressPush: true,
  suppressSound: true,
  suppressBadge: true,
  autoRead: true,
  reason: "same_room_foreground",
});

const baseInput = {
  roomId: "room-g",
  messageId: "m1",
  senderUserId: "user-a",
  preview: "hello",
  roomKind: "group" as const,
};

function usersOfCreatedEvents(): string[] {
  return createAndDispatchNotificationEvent.mock.calls.map((c) => (c[1] as { userId: string }).userId).sort();
}

describe("notify-message-pipeline P2 opt-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNotificationBlockedForRecipient.mockResolvedValue(false);
    isRoomMutedForUser.mockResolvedValue(false);
    loadRecipientPresenceSnapshot.mockResolvedValue({ appVisibility: "background", activeRoomId: null, lastPingAtMs: null });
    resolvePresenceSuppressDecision.mockReturnValue(presenceDecision());
    resolveOsPushAppStateFromPresence.mockReturnValue("background");
    loadNotificationUserLanguage.mockResolvedValue("en");
    loadMessageNotificationDisplaySharedContext.mockResolvedValue({
      resolvedRoomKind: "group",
      messageType: "text",
      textContent: "hello",
      sender: { displayName: "sender-a", avatarUrl: null },
      room: { name: "g", contextLabel: null },
      chatPreviewByUserId: new Map(),
      chatDomain: "group",
      domainIdentityKey: "group:room-g",
    });
    buildRecipientMessageNotificationDisplay.mockResolvedValue({
      title: "g",
      body: "sender-a: hello",
      chatDomain: "group",
      domainIdentityKey: "group:room-g",
    });
    createAndDispatchNotificationEvent.mockImplementation(async (_sb: unknown, input: { userId: string }) => ({
      ok: true,
      row: { id: `evt-${input.userId}`, user_id: input.userId },
    }));
    markRoomRead.mockResolvedValue(0);
  });

  it("parallel mode creates the same events as sequential and passes preloaded language", async () => {
    const recipients = ["u1", "u2", "u3"];
    const seq = await notifyMessagePipeline(sb, { ...baseInput, recipientUserIds: recipients });
    const seqUsers = usersOfCreatedEvents();
    createAndDispatchNotificationEvent.mockClear();
    buildRecipientMessageNotificationDisplay.mockClear();
    const par = await notifyMessagePipeline(sb, { ...baseInput, recipientUserIds: recipients }, { parallelRecipients: true });
    expect(usersOfCreatedEvents()).toEqual(seqUsers);
    expect(Object.keys(par.decisionSnapshotsByRecipientId).sort()).toEqual(
      Object.keys(seq.decisionSnapshotsByRecipientId).sort()
    );
    expect(buildRecipientMessageNotificationDisplay).toHaveBeenCalledTimes(3);
    for (const call of buildRecipientMessageNotificationDisplay.mock.calls) {
      expect(call[3]).toBe("en");
    }
  });

  it("parallel mode still skips blocked recipients and skips mute read for mentioned", async () => {
    isNotificationBlockedForRecipient.mockImplementation(async (_sb: unknown, uid: string) => uid === "u2");
    await notifyMessagePipeline(
      sb,
      { ...baseInput, recipientUserIds: ["u1", "u2"], preview: "hi @u1", mentionUserIds: ["u1"] },
      { parallelRecipients: true }
    );
    expect(usersOfCreatedEvents()).toEqual(["u1"]);
    expect(isRoomMutedForUser.mock.calls.map((c) => c[1])).not.toContain("u1");
  });

  it("parallel mode reads per recipient concurrently (all reads start before any event insert)", async () => {
    const order: string[] = [];
    isNotificationBlockedForRecipient.mockImplementation(async () => {
      order.push("read");
      return false;
    });
    createAndDispatchNotificationEvent.mockImplementation(async (_sb: unknown, input: { userId: string }) => {
      order.push("insert");
      return { ok: true, row: { id: `evt-${input.userId}`, user_id: input.userId } };
    });
    await notifyMessagePipeline(sb, { ...baseInput, recipientUserIds: ["u1", "u2"] }, { parallelRecipients: true });
    expect(order.slice(0, 2)).toEqual(["read", "read"]);
  });

  it("D1: server never reads presence nor auto-reads (deferAutoRead is a no-op)", async () => {
    resolvePresenceSuppressDecision.mockReturnValue(autoReadDecision);
    const res = await notifyMessagePipeline(
      sb,
      { ...baseInput, recipientUserIds: ["u1"] },
      { parallelRecipients: true, deferAutoRead: true }
    );
    expect(loadRecipientPresenceSnapshot).not.toHaveBeenCalled();
    expect(markRoomRead).not.toHaveBeenCalled();
    expect(res.autoReadRecipientIds).toEqual([]);
    const created = createAndDispatchNotificationEvent.mock.calls[0]?.[1] as {
      unread: boolean;
      appState: string;
      pushSuppressedReason: string | null;
    };
    expect(created.unread).toBe(true);
    expect(created.appState).toBe("background");
    expect(created.pushSuppressedReason).toBeNull();
  });

  it("parallel mode: one recipient failure keeps other recipients' partial results (no throw)", async () => {
    createAndDispatchNotificationEvent.mockImplementation(async (_sb: unknown, input: { userId: string }) => {
      if (input.userId === "u2") throw new Error("insert failed");
      return { ok: true, pushDeferred: true, row: { id: `evt-${input.userId}`, user_id: input.userId } };
    });
    const res = await notifyMessagePipeline(
      sb,
      { ...baseInput, recipientUserIds: ["u1", "u2", "u3"] },
      { parallelRecipients: true, deferAutoRead: true, deferPush: true }
    );
    expect(res.autoReadRecipientIds).toEqual([]);
    expect(Object.keys(res.decisionSnapshotsByRecipientId).sort()).toEqual(["u1", "u3"]);
    expect(res.deferredPushes.map((d) => d.row.id).sort()).toEqual(["evt-u1", "evt-u3"]);
  });

  it("default (no opt-in): no auto-read, badge cache invalidated per recipient", async () => {
    const res = await notifyMessagePipeline(sb, { ...baseInput, recipientUserIds: ["u1"] });
    expect(markRoomRead).not.toHaveBeenCalled();
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("u1");
    expect(res.autoReadRecipientIds).toEqual([]);
  });
});

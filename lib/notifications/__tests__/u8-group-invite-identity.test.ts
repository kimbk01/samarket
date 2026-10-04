/**
 * U8 — NOTIF-02: group invite is classified `group_message`; the DB requires
 * chat_domain + domain_identity_key for message types. The invite producer now passes
 * the existing `groupRoomIdentity(roomId)` (same shape as group message rows).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const createAndDispatchNotificationEvent = vi.fn();

vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: (...args: unknown[]) => createAndDispatchNotificationEvent(...args),
  dispatchNotificationEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/community-messenger/social-relations", () => ({ getBlockedRelation: vi.fn(async () => null) }));
vi.mock("@/lib/social/user-block-ssot", () => ({ isNotificationSuppressedForActor: vi.fn(() => false) }));
vi.mock("@/lib/notifications/notification-target-from-inbox-row", () => ({
  bumpNotificationTargetFromInboxRow: vi.fn(async () => undefined),
}));
vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({
  invalidateNotificationUnreadCountCache: vi.fn(),
}));
vi.mock("@/lib/delivery/owner/apply-owner-commerce-notification-invalidate", () => ({
  applyOwnerCommerceNotificationInvalidate: vi.fn(() => false),
  resolveOwnerCommerceNotificationStoreId: vi.fn(() => null),
}));
vi.mock("@/lib/notifications/commerce-notification-push-handoff", () => ({
  markCommercePushHandoffPending: vi.fn(async () => true),
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: vi.fn(async () => "ko"),
}));

/** Mirrors notification_events_message_domain_required_check + domain_identity_pair_check. */
function satisfiesDbChecks(input: { type: string; chatDomain?: string; domainIdentityKey?: string }): boolean {
  const messageTypes = ["chat_message", "group_message", "mention_message", "pin_message", "trade_message", "store_order_message"];
  const cd = input.chatDomain?.trim() ?? "";
  const key = input.domainIdentityKey?.trim() ?? "";
  if (!cd && !key) return !messageTypes.includes(input.type);
  if (!cd || !key) return false;
  return key.startsWith(`${cd}:`) && ["general_direct", "group", "trade", "store_order"].includes(cd);
}

describe("U8 group invite identity", () => {
  beforeEach(() => {
    createAndDispatchNotificationEvent.mockReset().mockResolvedValue({ ok: true, row: { id: "evt-1" } });
  });

  it("invite → group_message with group identity + room id (passes DB checks)", async () => {
    const { notifyCommunityMessengerGroupInviteReceived } = await import(
      "@/lib/notifications/community-messenger-group-inapp-notify"
    );
    await notifyCommunityMessengerGroupInviteReceived({} as never, {
      userId: "u-invitee",
      roomId: " room-1 ",
      roomTitle: "Team",
      inviterUserId: "u-inviter",
      inviterLabel: "Kim",
    });
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledTimes(1);
    const input = createAndDispatchNotificationEvent.mock.calls[0]![1];
    expect(input).toMatchObject({
      userId: "u-invitee",
      type: "group_message",
      roomId: "room-1",
      chatDomain: "group",
      domainIdentityKey: "group:room-1",
    });
    expect(input.displayPayload.routeUrl).toBe("/community-messenger/rooms/room-1");
    expect(input.displayPayload.legacyMeta.kind).toBe("community_group_invite");
    expect(satisfiesDbChecks(input)).toBe(true);
  });

  it("other appendUserNotification callers are unchanged (no identity fields)", async () => {
    const { appendUserNotification } = await import("@/lib/notifications/append-user-notification");
    await appendUserNotification({} as never, {
      user_id: "u1",
      notification_type: "review",
      title: "t",
      link_url: "/orders",
    });
    const input = createAndDispatchNotificationEvent.mock.calls[0]![1];
    expect(input).not.toHaveProperty("chatDomain");
    expect(input).not.toHaveProperty("domainIdentityKey");
    expect(input).not.toHaveProperty("roomId");
    expect(satisfiesDbChecks(input)).toBe(true);
  });
});

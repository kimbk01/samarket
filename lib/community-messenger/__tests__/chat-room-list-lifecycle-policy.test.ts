import { describe, expect, it } from "vitest";
import {
  COMPLETED_CHAT_LIST_VISIBLE_MS,
  isCompletedChatReadonly,
  shouldHideCompletedChatFromList,
  shouldShowCommerceChatInList,
} from "@/lib/community-messenger/chat-room-list-lifecycle-policy";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function baseRoom(partial: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
  return {
    id: partial.id ?? "room-1",
    roomType: "direct",
    roomStatus: partial.roomStatus ?? "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: partial.isReadonly ?? false,
    title: "",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    contextMeta: partial.contextMeta ?? null,
  };
}

describe("chat-room-list-lifecycle-policy trade", () => {
  const completedAt = "2026-06-01T12:00:00.000Z";
  const anchorMs = Date.parse(completedAt);

  it("shows completed trade in list before 7 days", () => {
    const room = baseRoom({
      contextMeta: {
        v: 1,
        kind: "trade",
        tradeFlowStatus: "buyer_confirmed",
        sellerCompletedAt: completedAt,
      },
    });
    const nowMs = anchorMs + COMPLETED_CHAT_LIST_VISIBLE_MS - 60 * 60 * 1000;
    expect(shouldShowCommerceChatInList(room, nowMs)).toBe(true);
    expect(isCompletedChatReadonly(room)).toBe(true);
  });

  it("hides completed trade from list after 7 days", () => {
    const room = baseRoom({
      contextMeta: {
        v: 1,
        kind: "trade",
        tradeFlowStatus: "buyer_confirmed",
        buyerConfirmedAt: completedAt,
      },
    });
    const nowMs = anchorMs + COMPLETED_CHAT_LIST_VISIBLE_MS + 1;
    expect(shouldHideCompletedChatFromList(room, nowMs)).toBe(true);
    expect(shouldShowCommerceChatInList(room, nowMs)).toBe(false);
  });
});

describe("chat-room-list-lifecycle-policy delivery", () => {
  const completedAt = "2026-06-01T12:00:00.000Z";
  const anchorMs = Date.parse(completedAt);

  it("hides completed delivery from list after 7 days", () => {
    const room = baseRoom({
      contextMeta: {
        v: 1,
        kind: "delivery",
        storeOrderId: "ord-1",
        orderStatus: "completed",
        deliveryCompletedAt: completedAt,
      },
    });
    const nowMs = anchorMs + COMPLETED_CHAT_LIST_VISIBLE_MS + 1;
    expect(shouldHideCompletedChatFromList(room, nowMs)).toBe(true);
    expect(isCompletedChatReadonly(room)).toBe(true);
  });

  it("shows completed delivery in list within 7 days", () => {
    const room = baseRoom({
      contextMeta: {
        v: 1,
        kind: "delivery",
        storeOrderId: "ord-1",
        orderStatus: "completed",
        deliveryCompletedAt: completedAt,
      },
    });
    const nowMs = anchorMs + COMPLETED_CHAT_LIST_VISIBLE_MS - 60 * 60 * 1000;
    expect(shouldShowCommerceChatInList(room, nowMs)).toBe(true);
  });
});

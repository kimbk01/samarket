import { describe, expect, it } from "vitest";
import { compareConversationStoreToLegacyBootstrap } from "@/lib/community-messenger/conversation-engine/shadow-compare";
import { __resetConversationStoreForTests, getConversationStore } from "@/lib/community-messenger/conversation-engine/conversation-store";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(partial: Partial<CommunityMessengerRoomSummary> & { id: string }): CommunityMessengerRoomSummary {
  return {
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: partial.title ?? "t",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "hi",
    lastMessageType: "text",
    lastMessageAt: "2026-07-29T10:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    chatDomain: "general_direct",
    ...partial,
  };
}

describe("shadow-compare", () => {
  it("matches after seed", () => {
    __resetConversationStoreForTests();
    const store = getConversationStore();
    const chats = [room({ id: "a" }), room({ id: "b", title: "B" })];
    const legacy = { chats, groups: [] } as unknown as CommunityMessengerBootstrap;
    store.seedFromRoomSummaries(chats);
    const result = compareConversationStoreToLegacyBootstrap(legacy);
    expect(result.ok).toBe(true);
    expect(result.legacyCount).toBe(2);
  });
});

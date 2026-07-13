import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessengerHomeShadowDispatch } from "@/lib/community-messenger/home/inbox-pipeline/shadow";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(id: string): CommunityMessengerRoomSummary {
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: id,
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "hi",
    lastMessageAt: "2026-07-13T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: true,
    contextMeta: null,
  };
}

function bootstrap(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: {
      id: "viewer",
      label: "viewer",
      avatarUrl: null,
      following: false,
      blocked: false,
      isFriend: false,
      isFavoriteFriend: false,
    },
    tabs: { friends: 0, chats: chats.length, groups: 0, calls: 0 },
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    requests: [],
    chats,
    groups: [],
    discoverableGroups: [],
    calls: [],
  };
}

describe("home_sync shadow dispatch gate", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  it("grows canonical only when home_sync apply path dispatches applied rooms", () => {
    const shadow = createMessengerHomeShadowDispatch();
    const legacy = bootstrap([room("known")]);
    shadow.dispatchRoomSummaries("full", 1, legacy.chats);
    shadow.compareLegacy(legacy, "viewer");
    expect(shadow.peekState().rooms.size).toBe(1);

    const phantom = room("phantom-from-applied-home-sync");
    const applied = bootstrap([...legacy.chats, phantom]);
    shadow.dispatchRoomSummaries("home_sync", 2, [...applied.chats, ...applied.groups]);
    shadow.compareLegacy(applied, "viewer");
    expect(shadow.peekState().rooms.has("phantom-from-applied-home-sync")).toBe(true);
    expect(shadow.peekState().rooms.size).toBe(2);
  });

  it("documents that unconditional home_sync dispatch would inflate canonical store", () => {
    const shadow = createMessengerHomeShadowDispatch();
    const legacy = bootstrap([room("known"), room("extra")]);
    shadow.dispatchRoomSummaries("full", 1, legacy.chats);
    expect(shadow.peekState().rooms.size).toBe(2);
    const phantom = room("phantom");
    shadow.dispatchRoomSummaries("home_sync", 2, [...legacy.chats, phantom]);
    expect(shadow.peekState().rooms.size).toBe(3);
  });
});

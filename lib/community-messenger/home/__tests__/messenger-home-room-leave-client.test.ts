import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  applyMessengerHomeRoomLeaveSuccess,
  requestLeaveMessengerRoomClient,
} from "@/lib/community-messenger/home/messenger-home-room-leave-client";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(id: string): CommunityMessengerRoomSummary {
  return {
    id,
    roomType: "direct",
    title: id,
    avatarUrl: null,
    peerUserId: null,
    memberCount: 2,
    lastMessage: "hi",
    lastMessageType: "text",
    lastMessageAt: "2026-05-16T10:00:00.000Z",
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
    isArchivedByViewer: false,
    contextMeta: null,
  } as CommunityMessengerRoomSummary;
}

function bootstrap(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: {
      id: "u1",
      label: "me",
      subtitle: "",
      bio: null,
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

describe("messenger-home-room-leave-client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("private_group uses DELETE participants endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const result = await requestLeaveMessengerRoomClient("g1", "private_group");
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/community-messenger/group-rooms/g1/participants",
      { method: "DELETE" }
    );
  });

  it("direct uses POST leave endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const result = await requestLeaveMessengerRoomClient("d1", "direct");
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/community-messenger/rooms/d1/leave",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("applyMessengerHomeRoomLeaveSuccess removes room via setData", () => {
    let state: CommunityMessengerBootstrap | null = bootstrap([room("a"), room("b")]);
    const setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>> = (updater) => {
      state = typeof updater === "function" ? updater(state) : updater;
    };
    applyMessengerHomeRoomLeaveSuccess("a", setData);
    expect(state?.chats).toHaveLength(1);
    expect(state?.chats[0]?.id).toBe("b");
  });
});

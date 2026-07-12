import { describe, expect, it } from "vitest";
import { sortChatListRooms } from "@/lib/community-messenger/chat-list/chat-list-sorter";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

function room(
  id: string,
  lastMessageAt: string,
  lastMessage = "msg"
): CommunityMessengerRoomSummary {
  return {
    id,
    title: id,
    roomType: "direct",
    isPinned: false,
    unreadCount: 0,
    lastMessage,
    lastMessageAt,
    lastMessageType: "text",
  } as CommunityMessengerRoomSummary;
}

function topChatIds(data: CommunityMessengerBootstrap | null): string[] {
  return sortChatListRooms([...(data?.chats ?? [])]).map((r) => r.id);
}

describe("refresh sort regression", () => {
  const roomA = "room-a";
  const roomB = "room-b";
  const staleAt = "2026-06-01T00:00:00.000Z";
  const callAt = "2026-06-15T10:00:00.000Z";

  const memory = {
    chats: [room(roomB, "2026-06-10T00:00:00.000Z"), room(roomA, callAt, "발신 중")],
    groups: [],
    calls: [],
    friends: [],
    requests: [],
    me: { id: "me" },
    tabs: { chats: 2, groups: 0, calls: 0, friends: 0 },
  } as unknown as CommunityMessengerBootstrap;

  it("home_sync replace keeps newer prev lastMessageAt when unread unchanged", () => {
    const afterReplace = applyHomeListPatch(
      memory,
      {
        kind: "home_sync",
        chats: [room(roomB, "2026-06-10T00:00:00.000Z"), room(roomA, staleAt, "발신 중")],
        roomMode: "replace",
      },
      "home-sync"
    );

    expect(topChatIds(afterReplace)).toEqual([roomA, roomB]);
    expect(afterReplace?.chats?.find((r) => r.id === roomA)?.lastMessageAt).toBe(callAt);
  });

  it("bootstrap_apply_full keeps newer prev lastMessageAt when unread unchanged", () => {
    const afterLite = applyHomeListPatch(
      memory,
      {
        kind: "bootstrap_apply_full",
        next: {
          ...memory,
          chats: [room(roomB, "2026-06-10T00:00:00.000Z"), room(roomA, staleAt, "발신 중")],
        } as CommunityMessengerBootstrap,
      },
      "bootstrap"
    );

    expect(topChatIds(afterLite)).toEqual([roomA, roomB]);
    expect(afterLite?.chats?.find((r) => r.id === roomA)?.lastMessageAt).toBe(callAt);
  });
});

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
  lastMessage = "msg",
  unreadCount = 0
): CommunityMessengerRoomSummary {
  return {
    id,
    title: id,
    roomType: "direct",
    isPinned: false,
    unreadCount,
    lastMessage,
    lastMessageAt,
    lastMessageType: "text",
  } as CommunityMessengerRoomSummary;
}

function bootstrap(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    chats,
    groups: [],
    calls: [],
    friends: [],
    requests: [],
    me: { id: "me" },
    tabs: { chats: chats.length, groups: 0, calls: 0, friends: 0 },
  } as unknown as CommunityMessengerBootstrap;
}

function chatIds(data: CommunityMessengerBootstrap | null): string[] {
  return (data?.chats ?? []).map((r) => r.id).sort();
}

describe("bootstrap_apply_full preserves previous-only rooms (capped partial)", () => {
  const staleAt = "2026-06-01T00:00:00.000Z";
  const midAt = "2026-06-10T00:00:00.000Z";
  const freshAt = "2026-06-15T10:00:00.000Z";
  const newerAt = "2026-06-20T00:00:00.000Z";

  it("keeps prev-only rooms, updates overlap, appends new, no duplicates", () => {
    const prev = bootstrap([
      room("room-old-1", staleAt, "old-1"),
      room("room-old-2", midAt, "old-2"),
      room("room-new-1", midAt, "prev-new-1"),
    ]);
    const incoming = bootstrap([
      room("room-new-1", freshAt, "updated-new-1"),
      room("room-new-2", freshAt, "brand-new"),
    ]);

    const next = applyHomeListPatch(
      prev,
      { kind: "bootstrap_apply_full", next: incoming },
      "bootstrap"
    );

    expect(chatIds(next)).toEqual(["room-new-1", "room-new-2", "room-old-1", "room-old-2"]);
    expect(next?.chats?.find((r) => r.id === "room-new-1")?.lastMessage).toBe("updated-new-1");
    expect(next?.chats?.find((r) => r.id === "room-new-1")?.lastMessageAt).toBe(freshAt);
    expect(next?.chats?.find((r) => r.id === "room-old-1")?.lastMessage).toBe("old-1");
    expect(next?.chats?.find((r) => r.id === "room-new-2")?.lastMessage).toBe("brand-new");
    expect(new Set(next?.chats?.map((r) => r.id)).size).toBe(next?.chats?.length);
  });

  it("does not roll back newer prev lastMessageAt with older incoming", () => {
    const prev = bootstrap([room("room-a", newerAt, "fresh-preview")]);
    const incoming = bootstrap([room("room-a", staleAt, "stale-preview")]);

    const next = applyHomeListPatch(
      prev,
      { kind: "bootstrap_apply_full", next: incoming },
      "bootstrap"
    );

    expect(next?.chats?.find((r) => r.id === "room-a")?.lastMessageAt).toBe(newerAt);
    expect(next?.chats?.find((r) => r.id === "room-a")?.lastMessage).toBe("fresh-preview");
  });

  it("empty capped incoming does not wipe existing rooms", () => {
    const prev = bootstrap([room("room-old-1", midAt), room("room-old-2", staleAt)]);
    const incoming = bootstrap([]);

    const next = applyHomeListPatch(
      prev,
      { kind: "bootstrap_apply_full", next: incoming },
      "bootstrap"
    );

    expect(chatIds(next)).toEqual(["room-old-1", "room-old-2"]);
  });

  it("preserves sort order of previous-only rooms relative to activity", () => {
    const prev = bootstrap([
      room("room-old-1", staleAt),
      room("room-hot", freshAt, "hot"),
      room("room-old-2", midAt),
    ]);
    const incoming = bootstrap([room("room-hot", newerAt, "hotter")]);

    const next = applyHomeListPatch(
      prev,
      { kind: "bootstrap_apply_full", next: incoming },
      "bootstrap"
    );

    const sorted = sortChatListRooms([...(next?.chats ?? [])]).map((r) => r.id);
    expect(sorted[0]).toBe("room-hot");
    expect(sorted).toContain("room-old-1");
    expect(sorted).toContain("room-old-2");
  });

  it("bootstrap_full_seed with prev+incoming also preserves prev-only rooms", () => {
    const prev = bootstrap([room("room-old-1", midAt), room("room-keep", midAt, "k")]);
    const incoming = bootstrap([room("room-keep", freshAt, "k2"), room("room-new", freshAt)]);

    const next = applyHomeListPatch(
      prev,
      { kind: "bootstrap_full_seed", bootstrap: incoming },
      "bootstrap"
    );

    expect(chatIds(next)).toEqual(["room-keep", "room-new", "room-old-1"]);
    expect(next?.chats?.find((r) => r.id === "room-keep")?.lastMessageAt).toBe(freshAt);
  });
});

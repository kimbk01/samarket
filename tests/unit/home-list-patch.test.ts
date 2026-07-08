import { beforeEach, describe, expect, it } from "vitest";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import { clearMessengerConsistencyStateForTests } from "@/lib/community-messenger/consistency/messenger-consistency-version";
import { clearHomeListServerUnreadIncreaseForTests } from "@/lib/community-messenger/merge-critical-home-sync-room-summary";
import { clearLocalReadGuardsForTests } from "@/lib/community-messenger/read/local-read-guard";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

function room(id: string, unread = 0): CommunityMessengerRoomSummary {
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
    unreadCount: unread,
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

describe("applyHomeListPatch", () => {
  beforeEach(() => {
    clearLocalReadGuardsForTests();
    clearMessengerConsistencyStateForTests();
    clearHomeListServerUnreadIncreaseForTests();
  });

  it("seeds bootstrap when prev is null", () => {
    const b = bootstrap([room("a")]);
    const next = applyHomeListPatch(null, { kind: "bootstrap_full_seed", bootstrap: b }, "bootstrap");
    expect(next?.chats).toHaveLength(1);
  });

  it("merges room summary via realtime source", () => {
    const prev = bootstrap([room("a", 2)]);
    const summary = { ...room("a", 0), lastMessage: "updated" };
    const next = applyHomeListPatch(prev, { kind: "merge_room_summary", summary }, "realtime");
    expect(next?.chats[0]?.lastMessage).toBe("updated");
  });

  it("home_sync critical_patch preserves richer trade meta", () => {
    const prev = bootstrap([
      {
        ...room("t1"),
        contextMeta: {
          v: 1,
          kind: "trade",
          headline: "Real title",
          productCategoryLabel: "Phones",
          priceLabel: "$10",
          thumbnailUrl: "https://x/y.jpg",
          postId: "p1",
        },
      },
    ]);
    const incoming = {
      ...room("t1"),
      contextMeta: {
        v: 1 as const,
        kind: "trade" as const,
        headline: "거래",
      },
    };
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: [incoming], roomMode: "critical_patch" },
      "home-sync"
    );
    expect(next?.chats[0]?.contextMeta?.kind).toBe("trade");
    if (next?.chats[0]?.contextMeta?.kind === "trade") {
      expect(next.chats[0].contextMeta.headline).toBe("Real title");
    }
  });

  it("remove_room drops from lists", () => {
    const prev = bootstrap([room("a"), room("b")]);
    const next = applyHomeListPatch(prev, { kind: "remove_room", roomId: "a" }, "bootstrap");
    expect(next?.chats).toHaveLength(1);
    expect(next?.chats[0]?.id).toBe("b");
  });

  it("home_sync critical_patch does not insert unknown direct room", () => {
    const prev = bootstrap([room("a")]);
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: [room("unknown-left")], roomMode: "critical_patch" },
      "home-sync"
    );
    expect(next?.chats).toHaveLength(1);
    expect(next?.chats[0]?.id).toBe("a");
    expect(next?.chats.some((r) => r.id === "unknown-left")).toBe(false);
  });

  it("home_sync critical_patch does not insert unknown private_group room", () => {
    const prev = bootstrap([room("a")]);
    const unknownGroup = { ...room("g-unknown"), roomType: "private_group" as const };
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", groups: [unknownGroup], roomMode: "critical_patch" },
      "home-sync"
    );
    expect(next?.groups).toHaveLength(0);
    expect(next?.chats).toHaveLength(1);
    expect(next?.chats[0]?.id).toBe("a");
  });

  it("home_sync critical_patch patches existing row without increasing count", () => {
    const prev = bootstrap([room("a"), room("b")]);
    const next = applyHomeListPatch(
      prev,
      {
        kind: "home_sync",
        chats: [{ ...room("b"), lastMessage: "ping", lastMessageAt: "2026-05-20T10:00:00.000Z" }],
        roomMode: "critical_patch",
      },
      "home-sync"
    );
    expect(next?.chats).toHaveLength(2);
    const b = next?.chats.find((r) => r.id === "b");
    expect(b?.lastMessage).toBe("ping");
  });

  it("home_sync critical_patch stale zero does not clobber positive unread", () => {
    const ts = "2026-05-16T10:00:00.000Z";
    const prev = bootstrap([{ ...room("a", 5), lastMessageAt: ts }]);
    const next = applyHomeListPatch(
      prev,
      {
        kind: "home_sync",
        chats: [{ ...room("a", 0), lastMessageAt: ts }],
        roomMode: "critical_patch",
      },
      "home-sync"
    );
    expect(next?.chats[0]?.unreadCount).toBe(5);
  });

  it("home_sync critical_patch applies server unread increase 0 to 5", () => {
    const ts = "2026-05-16T10:00:00.000Z";
    const prev = bootstrap([{ ...room("a", 0), lastMessageAt: ts }]);
    const next = applyHomeListPatch(
      prev,
      {
        kind: "home_sync",
        chats: [{ ...room("a", 5), lastMessageAt: ts }],
        roomMode: "critical_patch",
      },
      "home-sync"
    );
    expect(next?.chats[0]?.unreadCount).toBe(5);
  });

  it("merge_room_summary does not insert unknown direct room", () => {
    const prev = bootstrap([room("a")]);
    const next = applyHomeListPatch(
      prev,
      { kind: "merge_room_summary", summary: room("unknown-summary") },
      "realtime"
    );
    expect(next?.chats).toHaveLength(1);
    expect(next?.chats[0]?.id).toBe("a");
    expect(next).toBe(prev);
  });

  it("merge_room_summary does not insert unknown private_group room", () => {
    const prev = bootstrap([room("a")]);
    const unknownGroup = { ...room("g-unknown"), roomType: "private_group" as const };
    const next = applyHomeListPatch(
      prev,
      { kind: "merge_room_summary", summary: unknownGroup },
      "realtime"
    );
    expect(next?.groups).toHaveLength(0);
    expect(next?.chats).toHaveLength(1);
    expect(next).toBe(prev);
  });

  it("merge_room_summary patches existing row without increasing count", () => {
    const prev = bootstrap([room("a"), room("b")]);
    const next = applyHomeListPatch(
      prev,
      { kind: "merge_room_summary", summary: { ...room("b"), lastMessage: "updated-b" } },
      "realtime"
    );
    expect(next?.chats).toHaveLength(2);
    expect(next?.chats.find((r) => r.id === "b")?.lastMessage).toBe("updated-b");
  });

  it("home_sync replace can add server-authoritative new room", () => {
    const prev = bootstrap([room("a")]);
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: [room("a"), room("new-server")], roomMode: "replace" },
      "home-sync"
    );
    expect(next?.chats).toHaveLength(2);
    expect(next?.chats.map((r) => r.id)).toContain("new-server");
  });
});

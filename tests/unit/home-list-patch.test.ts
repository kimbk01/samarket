import { beforeEach, describe, expect, it } from "vitest";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import { clearMessengerConsistencyStateForTests } from "@/lib/community-messenger/consistency/messenger-consistency-version";
import { clearHomeListServerUnreadIncreaseForTests } from "@/lib/community-messenger/merge-critical-home-sync-room-summary";
import {
  clearLocalReadGuardsForTests,
  setLocalReadGuard,
} from "@/lib/community-messenger/read/local-read-guard";
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

  it("home_sync replace blocks stale positive decrease 5 to 3", () => {
    const ts = "2026-05-16T10:00:00.000Z";
    const prev = bootstrap([room("a", 5)]);
    const incoming = { ...room("a", 3), lastMessageAt: ts };
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: [incoming], roomMode: "replace" },
      "home-sync"
    );
    expect(next?.chats[0]?.unreadCount).toBe(5);
  });

  it("home_sync replace applies server unread increase 0 to 5 under read guard", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    setLocalReadGuard({ roomId: "a", referenceLastMessageAt: ts, source: "manual" });
    const prev = bootstrap([{ ...room("a", 0), lastMessageAt: ts }]);
    const incoming = { ...room("a", 5), lastMessageAt: ts };
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: [incoming], roomMode: "replace" },
      "home-sync"
    );
    expect(next?.chats[0]?.unreadCount).toBe(5);
  });

  it("home_sync replace allows read clear with lastReadMessageId evidence", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    const prev = bootstrap([room("a", 5)]);
    const incoming = {
      ...room("a", 0),
      lastMessageAt: ts,
      lastReadMessageId: "msg-read-1",
    } as CommunityMessengerRoomSummary;
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: [incoming], roomMode: "replace" },
      "home-sync"
    );
    expect(next?.chats[0]?.unreadCount).toBe(0);
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

/**
 * HOME_SYNC_PARTIAL_REPLACE_TRUNCATION 방지 — `full` tier 는 cap 30 partial 스냅샷이라
 * incoming 에 없는 기존 유효 room 을 삭제하면 안 된다(§ CANONICAL_53_IS_CORRECT).
 */
describe("applyHomeListPatch home_sync partial_upsert", () => {
  beforeEach(() => {
    clearLocalReadGuardsForTests();
    clearMessengerConsistencyStateForTests();
    clearHomeListServerUnreadIncreaseForTests();
  });

  function manyRooms(count: number, prefix = "r"): CommunityMessengerRoomSummary[] {
    return Array.from({ length: count }, (_, i) => room(`${prefix}${i}`));
  }

  it("7.1 truncation 방지: base 53 + incoming partial 29 -> 53 유지, 29 최신 필드 반영", () => {
    const prev = bootstrap(manyRooms(53));
    const incoming = manyRooms(29).map((r) => ({
      ...r,
      lastMessage: "updated",
      lastMessageAt: "2026-05-20T10:00:00.000Z",
    }));
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: incoming, roomMode: "partial_upsert" },
      "home-sync"
    );
    expect(next?.chats).toHaveLength(53);
    expect(next?.chats.find((r) => r.id === "r0")?.lastMessage).toBe("updated");
    expect(next?.chats.find((r) => r.id === "r28")?.lastMessage).toBe("updated");
    // cap 밖(30번째 이후) 기존 room 은 유지
    expect(next?.chats.find((r) => r.id === "r29")?.lastMessage).toBe("hi");
    expect(next?.chats.find((r) => r.id === "r52")).toBeTruthy();
  });

  it("7.2 incoming 신규 room 추가: base 53 + incoming(29, 신규 1 포함) -> 54", () => {
    const prev = bootstrap(manyRooms(53));
    const incoming = [...manyRooms(29), room("brand-new")];
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: incoming, roomMode: "partial_upsert" },
      "home-sync"
    );
    expect(next?.chats).toHaveLength(54);
    expect(next?.chats.some((r) => r.id === "brand-new")).toBe(true);
    expect(next?.chats.find((r) => r.id === "r52")).toBeTruthy();
  });

  it("7.3 기존 room 갱신: lastMessage / lastMessageAt / unread 증가 반영", () => {
    const prev = bootstrap([room("a", 0), room("b", 0), room("c", 0)]);
    const incoming = [
      {
        ...room("a", 5),
        lastMessage: "ping-a",
        lastMessageAt: "2026-05-21T10:00:00.000Z",
      },
    ];
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: incoming, roomMode: "partial_upsert" },
      "home-sync"
    );
    const a = next?.chats.find((r) => r.id === "a");
    expect(a?.lastMessage).toBe("ping-a");
    expect(a?.lastMessageAt).toBe("2026-05-21T10:00:00.000Z");
    expect(a?.unreadCount).toBe(5);
    // 나머지 유지
    expect(next?.chats).toHaveLength(3);
  });

  it("7.4 explicit remove: partial 누락은 삭제 안 됨, remove_room 은 삭제", () => {
    const prev = bootstrap([room("a"), room("b"), room("c")]);
    // b, c 가 payload 에서 누락되어도 유지
    const afterPartial = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: [room("a")], roomMode: "partial_upsert" },
      "home-sync"
    );
    expect(afterPartial?.chats).toHaveLength(3);
    // 명시적 remove 는 정상 삭제
    const afterRemove = applyHomeListPatch(
      afterPartial ?? prev,
      { kind: "remove_room", roomId: "b" },
      "bootstrap"
    );
    expect(afterRemove?.chats).toHaveLength(2);
    expect(afterRemove?.chats.some((r) => r.id === "b")).toBe(false);
  });

  it("7.5 empty partial: base 전체 유지 (no-op)", () => {
    const prev = bootstrap(manyRooms(53));
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: [], groups: [], roomMode: "partial_upsert" },
      "home-sync"
    );
    expect(next?.chats).toHaveLength(53);
    expect(next).toBe(prev);
  });

  it("7.6 authoritative replace 회귀: replace fixture 는 기존 축소 동작 유지", () => {
    const prev = bootstrap([room("a"), room("b"), room("c")]);
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: [room("a")], roomMode: "replace" },
      "home-sync"
    );
    // replace 는 payload 에 없는 방을 제거 (기존 계약 그대로)
    expect(next?.chats).toHaveLength(1);
    expect(next?.chats[0]?.id).toBe("a");
  });

  it("7.7 reference stability: 변경 없는 room 은 reference 유지", () => {
    const base = [room("a"), room("b"), room("c")];
    const prev = bootstrap(base);
    const originalB = prev.chats[1];
    const originalC = prev.chats[2];
    const next = applyHomeListPatch(
      prev,
      { kind: "home_sync", chats: [room("a")], roomMode: "partial_upsert" },
      "home-sync"
    );
    // a 는 display-equal -> 동일 참조 복원, b/c 는 payload 누락 -> 원본 유지
    expect(next?.chats.find((r) => r.id === "b")).toBe(originalB);
    expect(next?.chats.find((r) => r.id === "c")).toBe(originalC);
  });
});

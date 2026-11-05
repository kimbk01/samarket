/**
 * 초대받은 그룹이 Realtime 을 놓친 뒤(앱 백그라운드 중 초대) 목록에 끝내 안 생기던 결함 — 운영 2026-11-05 21:50 PHT 초대,
 * 22:09 PHT 까지 삼성(q테스트1) 목록에 없음. 서버 critical 목록에는 있음.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  HOME_LIST_MISSING_GROUP_FETCH_CAP,
  pickMissingPrivateGroupRoomIds,
} from "@/lib/community-messenger/home/home-list-missing-group-rooms";
import { clearRoomLeftLocally, markRoomLeftLocally } from "@/lib/community-messenger/room-snapshot-cache";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(id: string, roomType: CommunityMessengerRoomSummary["roomType"], lastMessageAt = "2026-11-05T13:55:43Z") {
  return {
    id,
    roomType,
    title: id,
    subtitle: "",
    avatarUrl: null,
    unreadCount: 0,
    isMuted: false,
    isPinned: false,
    lastMessage: "Permissions updated",
    lastMessageType: "system",
    lastMessageAt,
    memberCount: 2,
  } as CommunityMessengerRoomSummary;
}

function boot(chats: CommunityMessengerRoomSummary[], groups: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return { chats, groups, friends: [], requests: [], calls: [], tabs: { friends: 0, chats: 0, groups: 0, calls: 0 } } as unknown as CommunityMessengerBootstrap;
}

afterEach(() => clearRoomLeftLocally("g-left"));

describe("pickMissingPrivateGroupRoomIds", () => {
  it("서버 critical 목록에만 있는 비공개 그룹만 고른다", () => {
    const base = boot([room("d1", "direct")], [room("g-known", "private_group")]);
    const incoming = [room("g-known", "private_group"), room("g-new", "private_group"), room("o1", "open_group"), room("d1", "direct")];
    expect(pickMissingPrivateGroupRoomIds(incoming, base)).toEqual(["g-new"]);
  });

  it("이 기기에서 방금 나간 그룹은 고르지 않는다", () => {
    markRoomLeftLocally("g-left");
    expect(pickMissingPrivateGroupRoomIds([room("g-left", "private_group")], boot([], []))).toEqual([]);
  });

  it("목록 상태가 없으면 아무것도 하지 않는다 · 상한", () => {
    expect(pickMissingPrivateGroupRoomIds([room("g1", "private_group")], null)).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => room(`g${i}`, "private_group"));
    expect(pickMissingPrivateGroupRoomIds(many, boot([], []))).toHaveLength(HOME_LIST_MISSING_GROUP_FETCH_CAP);
  });
});

describe("critical_patch 는 여전히 넣지 않고(M1a), 단건 요약 insert 만 넣는다", () => {
  it("critical_patch — 모르는 그룹 무시 / insert_room_summary — 그룹 목록에 추가", () => {
    const base = boot([room("d1", "direct", "2026-11-05T13:41:47Z")], []);
    const patched = applyHomeListPatch(base, { kind: "home_sync", groups: [room("g-new", "private_group")], roomMode: "critical_patch" }, "home-sync");
    expect((patched?.groups ?? []).some((r) => r.id === "g-new")).toBe(false);
    const inserted = applyHomeListPatch(base, { kind: "insert_room_summary", summary: room("g-new", "private_group") }, "home-sync");
    expect((inserted?.groups ?? []).map((r) => r.id)).toContain("g-new");
  });
});

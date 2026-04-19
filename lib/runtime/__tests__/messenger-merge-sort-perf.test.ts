import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeBootstrapRoomSummaryIntoLists } from "@/lib/community-messenger/home/merge-bootstrap-room-summary-into-lists";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import {
  getMessengerRenderPerfCounts,
  resetMessengerHomeVerificationStateForTests,
} from "@/lib/runtime/samarket-runtime-debug";

function stubRuntimeDebugOn(): void {
  const sessionStorage = {
    getItem: (key: string) => (key === "samarket:debug:runtime" ? "1" : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  vi.stubGlobal("window", { sessionStorage });
  vi.stubGlobal("sessionStorage", sessionStorage);
}

function baseRoom(over: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id" | "lastMessageAt">): CommunityMessengerRoomSummary {
  return {
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "free",
    identityPolicy: "alias_allowed",
    isReadonly: false,
    title: "t",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    memberCount: 0,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: true,
    peerUserId: null,
    ...over,
  };
}

function emptyBootstrap(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: null,
    tabs: { friends: 0, chats: 0, groups: 0, calls: 0 },
    friends: [],
    hidden: [],
    blocked: [],
    requests: [],
    following: [],
    chats,
    groups: [],
    discoverableGroups: [],
    calls: [],
  };
}

describe("mergeBootstrapRoomSummaryIntoLists + messenger_room_list_sort 카운터", () => {
  beforeEach(() => {
    stubRuntimeDebugOn();
    resetMessengerHomeVerificationStateForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetMessengerHomeVerificationStateForTests();
  });

  it("이미 lastMessageAt 내림차순인 chats 버킷: merge 1회 시 messenger_room_list_sort 증가 없음", () => {
    const chats = [
      baseRoom({ id: "a", lastMessageAt: "2026-01-05T00:00:00.000Z" }),
      baseRoom({ id: "b", lastMessageAt: "2026-01-03T00:00:00.000Z" }),
    ];
    const data = emptyBootstrap(chats);
    const summary = baseRoom({ id: "c", lastMessageAt: "2026-01-04T00:00:00.000Z" });
    mergeBootstrapRoomSummaryIntoLists(data, summary);
    const perf = getMessengerRenderPerfCounts();
    expect(perf.messenger_room_summary_merge).toBe(1);
    expect(perf.messenger_room_list_sort ?? 0).toBe(0);
  });

  it("lastMessageAt 순서가 깨진 chats 버킷: merge 1회 시 messenger_room_list_sort 1회(전체 정렬)", () => {
    const chats = [
      baseRoom({ id: "a", lastMessageAt: "2026-01-03T00:00:00.000Z" }),
      baseRoom({ id: "b", lastMessageAt: "2026-01-05T00:00:00.000Z" }),
    ];
    const data = emptyBootstrap(chats);
    const summary = baseRoom({ id: "c", lastMessageAt: "2026-01-04T00:00:00.000Z" });
    mergeBootstrapRoomSummaryIntoLists(data, summary);
    const perf = getMessengerRenderPerfCounts();
    expect(perf.messenger_room_summary_merge).toBe(1);
    expect(perf.messenger_room_list_sort).toBe(1);
  });
});

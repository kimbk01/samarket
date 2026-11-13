// @vitest-environment jsdom
/**
 * 재감사 R3 (docs/design/group-chat-reaudit-2026-11-13.md §6 R3):
 * D2 에서 설계(행 비교·지문) 밖으로 넣은 목록 캐시 키 3곳(정렬 캐시 · 표시 목록 캐시 검색어 없음/있음)이 필요한지
 * 실제 홈 목록 훅을 그려 확인한다 — 사진만 바뀐 방 데이터를 넣으면 화면에 넘기는 목록이 새 사진이어야 한다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCommunityMessengerHomeState } from "@/lib/community-messenger/use-community-messenger-home-state";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function room(id: string, avatarUrl: string | null): CommunityMessengerRoomSummary {
  return {
    id,
    roomType: "private_group",
    roomStatus: "active",
    title: "B2B TEST",
    avatarUrl,
    subtitle: "",
    summary: "",
    lastMessageAt: "2026-11-05T00:00:00.000Z",
    lastMessage: "Permissions updated",
    lastMessageType: "system",
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
    isArchivedByViewer: false,
    isBlockedHiddenByViewer: false,
    memberCount: 2,
  } as unknown as CommunityMessengerRoomSummary;
}

function boot(groups: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: null,
    tabs: { friends: 0, chats: 0, groups: groups.length, calls: 0 } as never,
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    requests: [],
    chats: [],
    groups,
    discoverableGroups: [],
    calls: [],
  } as unknown as CommunityMessengerBootstrap;
}

const seen: { visible: (string | null)[] } = { visible: [] };

function Harness(props: { data: CommunityMessengerBootstrap; keyword: string }) {
  const st = useCommunityMessengerHomeState({
    data: props.data,
    mainSection: "chats" as never,
    chatInboxFilter: "all" as never,
    chatKindFilter: "all" as never,
    roomSearchKeyword: props.keyword,
    openGroupSearch: "",
  } as never) as unknown as { visibleChatListItems: { room: CommunityMessengerRoomSummary }[] };
  seen.visible = st.visibleChatListItems.map((i) => i.room.avatarUrl ?? null);
  return null;
}

describe("R3 홈 목록 훅 — 사진만 바뀐 그룹 방", () => {
  let root: Root;
  beforeEach(() => {
    root = createRoot(document.createElement("div"));
  });
  afterEach(() => act(() => root.unmount()));

  for (const keyword of ["", "b2b"]) {
    it(`검색어 「${keyword}」: 옛 사진 → 새 사진 데이터면 화면 목록도 새 사진`, () => {
      const id = `r3-room-${keyword || "none"}`;
      act(() => root.render(<Harness data={boot([room(id, null)])} keyword={keyword} />));
      expect(seen.visible).toEqual([null]);
      act(() => root.render(<Harness data={boot([room(id, "https://x/new.webp")])} keyword={keyword} />));
      expect(seen.visible).toEqual(["https://x/new.webp"]);
    });
  }
});

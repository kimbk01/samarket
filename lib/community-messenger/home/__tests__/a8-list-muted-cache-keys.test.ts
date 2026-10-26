import { describe, expect, it } from "vitest";
import { fingerprintHomeSyncLists } from "@/lib/community-messenger/home/home-sync-list-fingerprint";
import {
  communityMessengerRoomsSortCacheKey,
  visibleChatListInputKey,
  type UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";


/**
 * A-8 (10-27 07:05 Samsung 재현): DB is_muted=true · home-sync isMuted=true 인데 보관함 「알림 끔」 0,
 * 앱 재시작 후 1 — 목록 캐시 키 3곳에 알림 끔 값이 없어 옛 방 객체를 돌려줬다.
 */
const room = {
  id: "c202326f-8109-4ce4-aa61-394f0a799e7d",
  roomType: "direct",
  roomStatus: "active",
  title: "w테스트1",
  subtitle: "",
  summary: "",
  lastMessageAt: "2026-10-26T22:59:00.000Z",
  lastMessage: "Cff",
  lastMessageType: "text",
  unreadCount: 0,
  isPinned: false,
  isMuted: false,
  isArchivedByViewer: false,
  isBlockedHiddenByViewer: false,
} as unknown as CommunityMessengerRoomSummary;
const muted = { ...room, isMuted: true } as CommunityMessengerRoomSummary;

describe("A-8 알림 끔 값이 목록 캐시 키에 들어간다", () => {
  it("정렬 캐시 키 — 알림 끔만 바뀌어도 다른 키", () => {
    expect(communityMessengerRoomsSortCacheKey([room])).not.toBe(communityMessengerRoomsSortCacheKey([muted]));
  });

  it("대화 목록 표시 캐시 키 — 검색어 있음·없음 모두", () => {
    const item = (r: CommunityMessengerRoomSummary) => ({ room: r, preview: "Cff" }) as unknown as UnifiedRoomListItem;
    expect(visibleChatListInputKey([item(room)], "all" as never, "all" as never, "")).not.toBe(
      visibleChatListInputKey([item(muted)], "all" as never, "all" as never, "")
    );
    expect(visibleChatListInputKey([item(room)], "all" as never, "all" as never, "w")).not.toBe(
      visibleChatListInputKey([item(muted)], "all" as never, "all" as never, "w")
    );
  });

  it("목록 동기화 지문 — 알림 끔만 바뀐 서버 응답도 적용", () => {
    expect(fingerprintHomeSyncLists({ chats: [room] })).not.toBe(fingerprintHomeSyncLists({ chats: [muted] }));
  });
});

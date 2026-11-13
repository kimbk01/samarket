// @vitest-environment jsdom
/**
 * 그룹 채팅 결함 D2·D3 (docs/design/group-chat-audit-design-2026-11-13.md · PR F).
 * D2 운영 실측 2026-11-13: 그룹 사진을 바꿔도 홈 목록 행이 기본 아이콘 그대로(Xiaomi 4분·Samsung 47초 뒤),
 *    서버 응답 4종 모두 사진 있음 — 행 재사용 비교·목록 캐시 키·홈 지문에 사진이 없어 옛 행을 재사용.
 * D3 근본 원인(2026-11-13 재감사 기기 확인): 목록 행을 누르면 `primeMessengerRoomEntrySnapshot` 이 목록 행 요약으로
 *    방 캐시의 사진·제목을 덮어쓴다 — 진입 머리글은 목록 행(D2)이 맞으면 맞다. 진입 뒤 방 정보 요청은 필요 없다.
 */
import { describe, expect, it } from "vitest";
import { fingerprintHomeSyncLists } from "@/lib/community-messenger/home/home-sync-list-fingerprint";
import {
  communityMessengerRoomsSortCacheKey,
  unifiedListItemRowDisplayEqual,
  visibleChatListInputKey,
  type UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import { peekRoomSnapshot, primeRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { primeMessengerRoomEntrySnapshot } from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerRoomSnapshot, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const group = {
  id: "72a97f0f-65d9-4162-bae1-de33f0c30090",
  roomType: "private_group",
  roomStatus: "active",
  title: "B2B TEST",
  avatarUrl: null,
  subtitle: "",
  summary: "",
  lastMessageAt: "2026-11-13T06:30:00.000Z",
  lastMessage: "hi",
  lastMessageType: "text",
  unreadCount: 0,
  isPinned: false,
  isMuted: false,
  isArchivedByViewer: false,
  isBlockedHiddenByViewer: false,
} as unknown as CommunityMessengerRoomSummary;
const withPhoto = { ...group, avatarUrl: "https://x/g.webp" } as CommunityMessengerRoomSummary;
const renamed = { ...group, title: "새 이름" } as CommunityMessengerRoomSummary;
const item = (r: CommunityMessengerRoomSummary) => ({ room: r, preview: "hi" }) as unknown as UnifiedRoomListItem;

describe("D2 홈 목록 — 사진만 바뀐 방도 새 행으로", () => {
  it("행 재사용 비교(행 memo 와 같은 함수): 사진만 다르면 다른 행", () => {
    expect(unifiedListItemRowDisplayEqual(item(group), item(withPhoto))).toBe(false);
    expect(unifiedListItemRowDisplayEqual(item(withPhoto), item({ ...withPhoto } as CommunityMessengerRoomSummary))).toBe(
      true
    );
  });

  it("정렬 캐시 키·표시 캐시 키(검색어 있음·없음): 사진만 달라도 다른 키", () => {
    expect(communityMessengerRoomsSortCacheKey([group])).not.toBe(communityMessengerRoomsSortCacheKey([withPhoto]));
    for (const kw of ["", "b"]) {
      expect(visibleChatListInputKey([item(group)], "all" as never, "all" as never, kw)).not.toBe(
        visibleChatListInputKey([item(withPhoto)], "all" as never, "all" as never, kw)
      );
    }
  });

  it("홈 동기화 지문: 사진만·제목만 바뀐 응답도 「같음」으로 버리지 않는다", () => {
    expect(fingerprintHomeSyncLists({ groups: [group] })).not.toBe(fingerprintHomeSyncLists({ groups: [withPhoto] }));
    expect(fingerprintHomeSyncLists({ groups: [group] })).not.toBe(fingerprintHomeSyncLists({ groups: [renamed] }));
    expect(fingerprintHomeSyncLists({ chats: [group] })).not.toBe(fingerprintHomeSyncLists({ chats: [withPhoto] }));
  });
});

describe("D3 그룹 방 진입 머리글 — 목록 행 값이 방 캐시를 덮어쓴다", () => {
  it("옛 사진·제목이 든 방 캐시 → 목록 행 누르기(prime) → 방 캐시가 목록 행의 사진·제목", () => {
    const roomId = "d3-prime-group";
    const viewer = "member-2";
    const cachedOld = {
      viewerUserId: viewer,
      room: { ...group, id: roomId, title: "옛 제목", avatarUrl: null, lastMessage: "" },
      members: [],
      messages: [],
    } as unknown as CommunityMessengerRoomSnapshot;
    primeRoomSnapshot(roomId, cachedOld);
    expect(peekRoomSnapshot(roomId, viewer)?.room.avatarUrl).toBeNull();

    primeMessengerRoomEntrySnapshot({
      viewerUserId: viewer,
      room: { ...group, id: roomId, title: "새 제목", avatarUrl: "https://x/new.webp", lastMessage: "" } as CommunityMessengerRoomSummary,
    });
    const after = peekRoomSnapshot(roomId, viewer);
    expect(after?.room.avatarUrl).toBe("https://x/new.webp");
    expect(after?.room.title).toBe("새 제목");
  });
});

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

describe("A-8 보완 — 방 안에서 바꾼 알림 끔도 목록에 (10-27 07:26 실기기: 방 안에서 켬 → DB false, 목록·보관함은 1)", () => {
  it("참여자 실시간 행의 is_muted 가 힌트로 실리고, 목록 방에 서버 값으로 반영된다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts", "utf8");
    expect(src).toContain('typeof row.is_muted === "boolean" ? { isMuted: row.is_muted } : {}');
    const { mergeParticipantUnreadDeltaIntoHomeListRoom } = await import(
      "@/lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list"
    );
    const hint = { roomId: room.id, unreadCount: 0, lastReadAt: null, lastReadMessageId: null };
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(muted, { ...hint, isMuted: false }).isMuted).toBe(false);
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(room, { ...hint, isMuted: true }).isMuted).toBe(true);
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(room, hint)).toBe(room);
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(room, { ...hint, isMuted: false })).toBe(room);
  });

  it("알림 설정 저장 뒤 목록·부트스트랩 정합 스냅샷을 무효화한다(결함 F 와 같은 무효화)", async () => {
    const { readFileSync } = await import("node:fs");
    const svc = readFileSync("lib/community-messenger/service.ts", "utf8");
    const i = svc.indexOf("export async function updateCommunityMessengerParticipantSettings");
    const body = svc.slice(i, svc.indexOf("\nexport ", i + 10));
    expect(body).toContain("invalidateHomeSyncSnapshotCache(input.userId);");
    expect(body).toContain("invalidateCmBootstrapSnapshotCache(input.userId);");
    expect(body).toContain('invalidateFullBootstrapSnapshotCache(input.userId, "room_participant_settings");');
  });
});

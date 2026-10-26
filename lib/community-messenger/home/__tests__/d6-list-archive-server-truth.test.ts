import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeParticipantUnreadDeltaIntoHomeListRoom } from "@/lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list";
import { fingerprintHomeSyncLists } from "@/lib/community-messenger/home/home-sync-list-fingerprint";
import {
  communityMessengerRoomsSortCacheKey,
  unifiedListItemRowDisplayEqual,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/** docs/audit/messenger-2026-10-26-d6-list-archive-root-cause.md — 원인 A~D */
const room = {
  id: "c202326f-8109-4ce4-aa61-394f0a799e7d",
  roomType: "direct",
  roomStatus: "active",
  title: "w테스트1",
  lastMessageAt: "2026-10-26T08:43:52.000Z",
  lastMessage: "D6f",
  lastMessageType: "text",
  unreadCount: 6,
  isMuted: false,
  isArchivedByViewer: true,
  isBlockedHiddenByViewer: false,
} as unknown as CommunityMessengerRoomSummary;

describe("D-6 목록 보관 값 = 서버 participants.is_archived", () => {
  it("A: 참여자 실시간 행의 is_archived 가 힌트로 실린다", () => {
    const src = readFileSync("lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts", "utf8");
    expect(src).toContain('typeof row.is_archived === "boolean" ? { isArchived: row.is_archived } : {}');
  });

  it("A: 안 읽은 수가 같아도 보관 값이 바뀌면 서버 값으로 맞춘다 · 값 없으면 그대로", () => {
    const hint = { roomId: room.id, unreadCount: 6, lastReadAt: null, lastReadMessageId: null };
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(room, { ...hint, isArchived: false }).isArchivedByViewer).toBe(false);
    const unarchived = { ...room, isArchivedByViewer: false };
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(unarchived, { ...hint, isArchived: true }).isArchivedByViewer).toBe(true);
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(room, hint)).toBe(room);
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(room, { ...hint, isArchived: true })).toBe(room);
  });

  it("B: 보관 값만 바뀌면 정렬 캐시 키가 달라 옛 방 객체가 나오지 않는다", () => {
    const key = communityMessengerRoomsSortCacheKey([room]);
    expect(communityMessengerRoomsSortCacheKey([{ ...room }])).toBe(key);
    expect(communityMessengerRoomsSortCacheKey([{ ...room, isArchivedByViewer: false }])).not.toBe(key);
    expect(communityMessengerRoomsSortCacheKey([{ ...room, isBlockedHiddenByViewer: true }])).not.toBe(key);
  });

  it("C: 보관 값만 바뀐 행은 재사용하지 않는다", () => {
    const item = (r: CommunityMessengerRoomSummary) => ({
      room: r,
      preview: "D6f",
      previewKind: "message" as const,
      callStatus: null,
      callKind: null,
      lastEventAt: r.lastMessageAt,
    });
    expect(unifiedListItemRowDisplayEqual(item(room), item({ ...room }))).toBe(true);
    expect(unifiedListItemRowDisplayEqual(item(room), item({ ...room, isArchivedByViewer: false }))).toBe(false);
  });

  it("D: 서버가 보관 값만 바꿔 보내도 home-sync 동일 판정에서 버리지 않는다", () => {
    expect(fingerprintHomeSyncLists({ chats: [room] })).not.toBe(
      fingerprintHomeSyncLists({ chats: [{ ...room, isArchivedByViewer: false }] })
    );
  });
});

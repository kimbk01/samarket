import { describe, expect, it } from "vitest";
import { fingerprintHomeSyncLists } from "@/lib/community-messenger/home/home-sync-list-fingerprint";
import { mergeParticipantUnreadDeltaIntoHomeListRoom } from "@/lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/**
 * A-15: 고정은 목록 시트에서만 바뀌고(같은 기기는 낙관 반영), 다른 기기에는 participants Realtime 힌트·home-sync 로만 온다.
 * 힌트에 is_pinned 가 없고 지문에도 없어 「같음」으로 버려졌다.
 */
const room = {
  id: "c202326f-8109-4ce4-aa61-394f0a799e7d",
  roomType: "direct",
  lastMessageAt: "2026-10-26T22:59:00.000Z",
  lastMessage: "Cff",
  lastMessageType: "text",
  unreadCount: 0,
  isPinned: false,
  isMuted: false,
  isArchivedByViewer: false,
} as unknown as CommunityMessengerRoomSummary;
const pinned = { ...room, isPinned: true } as CommunityMessengerRoomSummary;

describe("A-15 다른 기기에서 바꾼 고정이 목록에 반영된다", () => {
  it("목록 동기화 지문 — 고정만 바뀐 서버 응답도 적용", () => {
    expect(fingerprintHomeSyncLists({ chats: [room] })).not.toBe(fingerprintHomeSyncLists({ chats: [pinned] }));
    expect(fingerprintHomeSyncLists({ groups: [room] })).not.toBe(fingerprintHomeSyncLists({ groups: [pinned] }));
  });

  it("참여자 실시간 행의 is_pinned 가 힌트로 실리고, 목록 방에 서버 값으로 반영된다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts", "utf8");
    expect(src).toContain('typeof row.is_pinned === "boolean" ? { isPinned: row.is_pinned } : {}');
    const hint = { roomId: room.id, unreadCount: 0, lastReadAt: null, lastReadMessageId: null };
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(room, { ...hint, isPinned: true }).isPinned).toBe(true);
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(pinned, { ...hint, isPinned: false }).isPinned).toBe(false);
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(room, { ...hint, isPinned: false })).toBe(room);
    expect(mergeParticipantUnreadDeltaIntoHomeListRoom(room, hint)).toBe(room);
  });
});

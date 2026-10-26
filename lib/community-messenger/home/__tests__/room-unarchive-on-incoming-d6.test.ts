import { describe, expect, it } from "vitest";
import { incomingRealtimeMessageUnarchivesRoom } from "@/lib/community-messenger/home/room-unarchive-on-incoming";
import { fingerprintHomeSyncLists } from "@/lib/community-messenger/home/home-sync-list-fingerprint";
import { patchBootstrapRoomListForRealtimeMessageInsert } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const ME = "me-1";
const PEER = "peer-1";
const archived = { isArchivedByViewer: true, isMuted: false, isBlockedHiddenByViewer: false };

describe("D-6 목록 실시간 보관 해제 규칙", () => {
  it("받은 메시지 → 해제 · 내가 보낸 것·알림 꺼짐·차단 숨김·보관 아님 → 그대로", () => {
    const row = { sender_id: PEER, message_type: "text" };
    expect(incomingRealtimeMessageUnarchivesRoom({ room: archived, messageRow: row, viewerUserId: ME })).toBe(true);
    expect(
      incomingRealtimeMessageUnarchivesRoom({ room: archived, messageRow: { ...row, sender_id: ME }, viewerUserId: ME })
    ).toBe(false);
    expect(
      incomingRealtimeMessageUnarchivesRoom({ room: { ...archived, isMuted: true }, messageRow: row, viewerUserId: ME })
    ).toBe(false);
    expect(
      incomingRealtimeMessageUnarchivesRoom({
        room: { ...archived, isBlockedHiddenByViewer: true },
        messageRow: row,
        viewerUserId: ME,
      })
    ).toBe(false);
    expect(
      incomingRealtimeMessageUnarchivesRoom({
        room: { ...archived, isArchivedByViewer: false },
        messageRow: row,
        viewerUserId: ME,
      })
    ).toBe(false);
  });

  it("통화 기록은 부재중만", () => {
    const stub = (callStatus: string) => ({ sender_id: PEER, message_type: "call_stub", metadata: { callStatus } });
    expect(incomingRealtimeMessageUnarchivesRoom({ room: archived, messageRow: stub("missed"), viewerUserId: ME })).toBe(true);
    for (const s of ["ended", "rejected", "cancelled"]) {
      expect(incomingRealtimeMessageUnarchivesRoom({ room: archived, messageRow: stub(s), viewerUserId: ME })).toBe(false);
    }
  });

  it("서버 응답이 보관 값만 달라도 지문이 달라 버려지지 않음(2026-10-26 실기기 원인)", () => {
    const base = { id: "r1", lastMessageAt: "2026-10-26T08:03:10.532Z", unreadCount: 1, lastMessage: "D6a1603", lastMessageType: "text" };
    const a = fingerprintHomeSyncLists({ chats: [{ ...base, isArchivedByViewer: true } as CommunityMessengerRoomSummary] });
    const b = fingerprintHomeSyncLists({ chats: [{ ...base, isArchivedByViewer: false } as CommunityMessengerRoomSummary] });
    expect(a).not.toBe(b);
  });

  it("목록 실시간 메시지 반영이 보관을 풀어 목록에 돌림", () => {
    const room = {
      id: "r1",
      lastMessageAt: "2026-10-26T08:00:00.000Z",
      lastMessage: "old",
      lastMessageType: "text",
      unreadCount: 0,
      ...archived,
    } as unknown as CommunityMessengerRoomSummary;
    const data = { me: { id: ME }, chats: [room], groups: [] } as unknown as CommunityMessengerBootstrap;
    const next = patchBootstrapRoomListForRealtimeMessageInsert(data, "r1", {
      id: "m-d6",
      room_id: "r1",
      sender_id: PEER,
      message_type: "text",
      content: "D6a1603",
      created_at: "2026-10-26T08:03:10.532Z",
    });
    expect(next.chats?.[0]?.isArchivedByViewer).toBe(false);
  });
});

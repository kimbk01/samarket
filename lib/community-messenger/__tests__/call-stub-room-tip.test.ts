import { describe, expect, it } from "vitest";
import {
  callStubRoomTipFromMessage,
  decodeCallStubRoomTip,
  encodeCallStubRoomTip,
  formatCallStubRoomTipForViewer,
  resolveRoomLastMessageForViewer,
} from "@/lib/community-messenger/call-stub-room-tip";
import { canonicalRoomListPreviewFromMessageFields } from "@/lib/community-messenger/room-list-semantic-preview";
import { listPreviewFromMessengerMessageRow } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import { getRoomPreviewText } from "@/lib/community-messenger/cm-home-list-copy";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const CALLER = "719de75f-9b58-4bf4-8ac9-3e37e64e222c";
const CALLEE = "46a41536-1b60-4e74-b132-2dec17798475";

/** 실측 DB 행(2026-10-15 06:29 발신 취소) metadata 형태 */
const cancelledMeta = {
  callKind: "voice",
  sessionId: "85fa8363-3a04-4521-ab2c-c29c2774503d",
  callStatus: "cancelled",
  endedReason: "canceled",
  durationSeconds: null,
  initiatorUserId: CALLER,
  recipientUserId: CALLEE,
  callResolvedEvent: "cancelled_by_caller",
};

function tipFor(meta: Record<string, unknown>, label: string) {
  return callStubRoomTipFromMessage({ content: label, metadata: meta });
}

describe("call stub room tip — 발신자·수신자별 리스트 문구 (F5)", () => {
  it("발신 취소: 발신자 '취소됨' / 수신자 '부재중'", () => {
    const tip = tipFor(cancelledMeta, "음성 통화 · 취소됨");
    expect(formatCallStubRoomTipForViewer(tip, CALLER)).toBe("음성 통화 · 취소됨");
    expect(formatCallStubRoomTipForViewer(tip, CALLEE)).toBe("부재중 음성 통화");
  });
  it("거절: 발신자 '거절됨' / 수신자 '거절함'", () => {
    const tip = tipFor(
      { ...cancelledMeta, callStatus: "rejected", callResolvedEvent: "rejected_by_callee" },
      "음성 통화 · 거절됨"
    );
    expect(formatCallStubRoomTipForViewer(tip, CALLER)).toBe("음성 통화 · 거절됨");
    expect(formatCallStubRoomTipForViewer(tip, CALLEE)).toBe("음성 통화 · 거절함");
  });
  it("무응답: 발신자 '응답 없음' / 수신자 '부재중'", () => {
    const tip = tipFor({ ...cancelledMeta, callStatus: "missed", callResolvedEvent: "missed" }, "부재중 음성 통화");
    expect(formatCallStubRoomTipForViewer(tip, CALLER)).toBe("음성 통화 · 응답 없음");
    expect(formatCallStubRoomTipForViewer(tip, CALLEE)).toBe("부재중 음성 통화");
  });
  it("연결 후 종료: 양쪽 통화 시간, 0초면 '통화 종료'(시간 미표시)", () => {
    const tip = tipFor(
      { ...cancelledMeta, callKind: "video", callStatus: "ended", callResolvedEvent: "ended", durationSeconds: 75 },
      "영상 통화 · 01:15"
    );
    const a = formatCallStubRoomTipForViewer(tip, CALLER);
    expect(a).toBe(formatCallStubRoomTipForViewer(tip, CALLEE));
    expect(a.startsWith("영상 통화 · ")).toBe(true);
    expect(a).not.toContain("통화 종료");
    const zero = tipFor(
      { ...cancelledMeta, callStatus: "ended", callResolvedEvent: "ended", durationSeconds: 0 },
      "음성 통화 · 통화 종료"
    );
    expect(formatCallStubRoomTipForViewer(zero, CALLER)).toBe("음성 통화 · 통화 종료");
  });
  it("viewer 미상·제3자·레거시 라벨은 공유 라벨/원문", () => {
    const tip = tipFor(cancelledMeta, "음성 통화 · 취소됨");
    expect(formatCallStubRoomTipForViewer(tip, null)).toBe("음성 통화 · 취소됨");
    expect(formatCallStubRoomTipForViewer(tip, "someone-else")).toBe("음성 통화 · 취소됨");
    expect(resolveRoomLastMessageForViewer("음성 통화 · 취소됨", CALLEE)).toBe("음성 통화 · 취소됨");
    expect(resolveRoomLastMessageForViewer("hello", CALLEE)).toBe("hello");
  });
  it("initiator 없는 메타는 토큰을 만들지 않는다(기존 동작)", () => {
    expect(tipFor({ callKind: "voice", callStatus: "cancelled" }, "음성 통화 · 취소됨")).toBe("음성 통화 · 취소됨");
  });
  it("encode/decode 왕복", () => {
    const t = encodeCallStubRoomTip({
      callKind: "voice",
      status: "cancelled",
      resolvedEvent: "cancelled_by_caller",
      initiatorUserId: CALLER,
      recipientUserId: CALLEE,
      durationSeconds: 0,
      sharedLabel: "음성 통화 · 취소됨",
    });
    expect(decodeCallStubRoomTip(t)?.initiatorUserId).toBe(CALLER);
    expect(decodeCallStubRoomTip(t)?.sharedLabel).toBe("음성 통화 · 취소됨");
  });
  it("서버 재계산·Realtime 패치·홈 렌더가 같은 결과 (HTTP/Realtime 경로 일치)", () => {
    const server = canonicalRoomListPreviewFromMessageFields({
      messageType: "call_stub",
      content: "음성 통화 · 취소됨",
      metadata: cancelledMeta,
    });
    const realtime = listPreviewFromMessengerMessageRow({
      message_type: "call_stub",
      content: "음성 통화 · 취소됨",
      metadata: cancelledMeta,
      created_at: "2026-10-15T06:29:45.325Z",
    });
    expect(realtime?.lastMessage).toBe(server.lastMessage);
    const room = {
      id: "6f64081d-7ec7-47be-9284-809c4ec1b53b",
      roomType: "direct",
      lastMessage: server.lastMessage,
      lastMessageType: "call_stub",
      lastMessageAt: "2026-10-15T06:29:50.715Z",
    } as CommunityMessengerRoomSummary;
    expect(getRoomPreviewText(room, CALLEE)).toContain("부재중");
    expect(getRoomPreviewText(room, CALLER)).toContain("취소됨");
    expect(getRoomPreviewText(room, CALLER)).not.toContain("cmcall1");
  });
});

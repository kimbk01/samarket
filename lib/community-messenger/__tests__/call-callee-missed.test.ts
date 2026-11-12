import { describe, expect, it } from "vitest";
import {
  callStubIncrementsCalleeUnread,
  isCallerCancelledCallStub,
  isMissedCallStubForViewer,
} from "@/lib/community-messenger/call-callee-missed";
import { messengerRealtimeRowPlaysReceiveSound } from "@/lib/community-messenger/realtime/call-stub-receive-sound-policy";
import { buildMessengerInAppBannerContent } from "@/lib/community-messenger/notifications/messenger-in-app-banner-content";
import type { CommunityMessengerMessage, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/** Owner 2026-11-13 「발신 후 수신 전 취소 = 수신자 부재중」 D6 — 진입점이 같은 판정을 쓴다 */
const CALLER = "caller-1";
const CALLEE = "callee-1";

describe("call-callee-missed 판정", () => {
  it("발신자 취소 = 수신자에게 부재중, 발신자에게 아님", () => {
    const base = { callStatus: "cancelled", resolvedEvent: "cancelled_by_caller", initiatorUserId: CALLER };
    expect(isMissedCallStubForViewer({ ...base, viewerUserId: CALLEE })).toBe(true);
    expect(isMissedCallStubForViewer({ ...base, viewerUserId: CALLER })).toBe(false);
  });
  it("받지 않음(missed) = 누구에게나 부재중 (기존 그대로)", () => {
    expect(isMissedCallStubForViewer({ callStatus: "missed", viewerUserId: CALLER })).toBe(true);
    expect(isMissedCallStubForViewer({ callStatus: "missed", viewerUserId: CALLEE })).toBe(true);
  });
  it("통화 중·거절·종료는 부재중 아님", () => {
    for (const resolvedEvent of ["peer_busy", "caller_busy"]) {
      expect(
        isMissedCallStubForViewer({ callStatus: "cancelled", resolvedEvent, initiatorUserId: CALLER, viewerUserId: CALLEE }),
      ).toBe(false);
    }
    expect(isCallerCancelledCallStub({ callStatus: "cancelled", endedReason: "peer_busy" })).toBe(false);
    expect(isCallerCancelledCallStub({ callStatus: "cancelled", endedReason: "redial_replaced" })).toBe(false);
    expect(isMissedCallStubForViewer({ callStatus: "rejected", viewerUserId: CALLEE, initiatorUserId: CALLER })).toBe(false);
    expect(isMissedCallStubForViewer({ callStatus: "ended", viewerUserId: CALLEE, initiatorUserId: CALLER })).toBe(false);
  });
  it("발신자 정보가 없으면 보낸 사람(= 취소한 발신자)으로 판정", () => {
    expect(isMissedCallStubForViewer({ callStatus: "cancelled", senderUserId: CALLER, viewerUserId: CALLEE })).toBe(true);
    expect(isMissedCallStubForViewer({ callStatus: "cancelled", senderUserId: CALLER, viewerUserId: CALLER })).toBe(false);
    expect(isMissedCallStubForViewer({ callStatus: "cancelled", viewerUserId: CALLEE })).toBe(false);
  });
  it("서버 안 읽은 수: 부재중 + 발신자가 보낸 발신자 취소만", () => {
    expect(callStubIncrementsCalleeUnread({ status: "missed" })).toBe(true);
    expect(
      callStubIncrementsCalleeUnread({ status: "cancelled", endedReason: "canceled", stubActorUserId: CALLER, initiatorUserId: CALLER }),
    ).toBe(true);
    /** 보낸 사람이 수신자면 발신자 안 읽은 수가 오르게 되므로 올리지 않는다 */
    expect(
      callStubIncrementsCalleeUnread({ status: "cancelled", endedReason: "canceled", stubActorUserId: CALLEE, initiatorUserId: CALLER }),
    ).toBe(false);
    for (const endedReason of ["peer_busy", "caller_busy", "redial_replaced", ""]) {
      expect(
        callStubIncrementsCalleeUnread({ status: "cancelled", endedReason, stubActorUserId: CALLER, initiatorUserId: CALLER }),
      ).toBe(false);
    }
    for (const status of ["ended", "rejected"]) {
      expect(callStubIncrementsCalleeUnread({ status, stubActorUserId: CALLER, initiatorUserId: CALLER })).toBe(false);
    }
  });
});

describe("진입점 — 실시간 수신음", () => {
  const row = (callStatus: string, callResolvedEvent: string) => ({
    message_type: "call_stub",
    sender_id: CALLER,
    metadata: { callStatus, callResolvedEvent, initiatorUserId: CALLER, recipientUserId: CALLEE, endedReason: "canceled" },
  });
  it("발신자 취소: 수신자 소리 · 발신자 무음", () => {
    expect(messengerRealtimeRowPlaysReceiveSound(row("cancelled", "cancelled_by_caller"), CALLEE)).toBe(true);
    expect(messengerRealtimeRowPlaysReceiveSound(row("cancelled", "cancelled_by_caller"), CALLER)).toBe(false);
  });
  it("받지 않음은 소리 · 종료는 무음 · 일반 메시지는 소리 (기존 그대로)", () => {
    expect(messengerRealtimeRowPlaysReceiveSound(row("missed", "missed"), CALLEE)).toBe(true);
    expect(messengerRealtimeRowPlaysReceiveSound(row("ended", "ended"), CALLEE)).toBe(false);
    expect(messengerRealtimeRowPlaysReceiveSound({ message_type: "text" }, CALLEE)).toBe(true);
  });
});

describe("진입점 — 안 읽은 수 경로는 통화 기록 배너를 만들지 않음 (D7)", () => {
  const room = { id: "room-1", roomType: "direct", title: "t" } as unknown as CommunityMessengerRoomSummary;
  const stub = (callStatus: string, callResolvedEvent: string): CommunityMessengerMessage =>
    ({
      id: "m1",
      roomId: "room-1",
      senderId: CALLER,
      senderLabel: "발신자",
      messageType: "call_stub",
      content: "음성 통화 · 취소",
      createdAt: new Date().toISOString(),
      callKind: "voice",
      callStatus,
      callSessionId: "s1",
      metadata: { callStatus, callResolvedEvent, initiatorUserId: CALLER, recipientUserId: CALLEE, endedReason: "canceled" },
    }) as unknown as CommunityMessengerMessage;
  it("발신자 취소·부재중 통화 기록 모두 null — 부재중 배너는 부재중 알림 행이 근거", () => {
    for (const [st, ev] of [["cancelled", "cancelled_by_caller"], ["missed", "missed"]] as const) {
      expect(
        buildMessengerInAppBannerContent({ room, messages: [stub(st, ev)], viewerUserId: CALLEE, language: "ko", chatPreviewEnabled: true }),
      ).toBeNull();
    }
  });
});

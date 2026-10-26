import { describe, expect, it } from "vitest";
import { messengerRealtimeRowPlaysReceiveSound } from "@/lib/community-messenger/realtime/call-stub-receive-sound-policy";

describe("N-1 통화 기록 수신음 규칙", () => {
  it("일반 메시지는 지금처럼 수신음", () => {
    expect(messengerRealtimeRowPlaysReceiveSound({ message_type: "text" })).toBe(true);
    expect(messengerRealtimeRowPlaysReceiveSound({ message_type: "image" })).toBe(true);
    expect(messengerRealtimeRowPlaysReceiveSound({})).toBe(true);
  });

  it("상대가 끊은 받은 통화(ended)·거절·취소 기록은 수신음 없음 — 2026-10-26 실기기 결함", () => {
    for (const callStatus of ["ended", "rejected", "cancelled", "canceled", "busy"]) {
      expect(messengerRealtimeRowPlaysReceiveSound({ message_type: "call_stub", metadata: { callStatus } })).toBe(false);
    }
  });

  it("부재중 통화 기록은 수신음 유지(서버 안 읽은 수 규칙과 같음)", () => {
    expect(messengerRealtimeRowPlaysReceiveSound({ message_type: "call_stub", metadata: { callStatus: "missed" } })).toBe(
      true
    );
  });

  it("상태를 알 수 없는 통화 기록은 소리 없음", () => {
    expect(messengerRealtimeRowPlaysReceiveSound({ message_type: "call_stub" })).toBe(false);
    expect(messengerRealtimeRowPlaysReceiveSound({ message_type: "call_stub", metadata: null })).toBe(false);
  });
});

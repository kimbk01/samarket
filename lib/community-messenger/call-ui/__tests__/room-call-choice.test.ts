import { describe, expect, it } from "vitest";
import { resolveRoomCallChoice, type RoomCallChoiceInput } from "@/lib/community-messenger/call-ui/room-call-choice";

const base: RoomCallChoiceInput = {
  isGroupRoom: false,
  roomGloballyUsable: true,
  callKind: "general",
  tradePolicy: "none",
  storeVoiceCallsEnabled: null,
  storeVideoCallsEnabled: null,
  directCallGate: null,
  roomUnavailable: false,
  outgoingDialLocked: false,
  directMessageDenied: null,
  blockedByMe: false,
};

describe("resolveRoomCallChoice — 통화 버튼 통합 2판", () => {
  it("1:1 일반: 📞 보임 · 음성·영상 모두 가능", () => {
    const r = resolveRoomCallChoice(base);
    expect(r.showEntry).toBe(true);
    expect(r.voice.enabled).toBe(true);
    expect(r.video.enabled).toBe(true);
  });

  it("그룹(보류)·방 사용 불가: 📞 숨김", () => {
    expect(resolveRoomCallChoice({ ...base, isGroupRoom: true }).showEntry).toBe(false);
    expect(resolveRoomCallChoice({ ...base, roomGloballyUsable: false }).showEntry).toBe(false);
  });

  it("거래 글 통화 「허용 안 함」: 📞 숨김", () => {
    expect(resolveRoomCallChoice({ ...base, callKind: "trade", tradePolicy: "none" }).showEntry).toBe(false);
  });

  it("거래 글 「음성만」: 영상 줄 회색(방 규칙)", () => {
    const r = resolveRoomCallChoice({ ...base, callKind: "trade", tradePolicy: "voice_only" });
    expect(r.showEntry).toBe(true);
    expect(r.voice.enabled).toBe(true);
    expect(r.video).toEqual({ enabled: false, reason: "policy", reasonKey: "cm_call_choice_trade_voice_only" });
  });

  it("거래 글 「음성·영상」: 모두 가능", () => {
    const r = resolveRoomCallChoice({ ...base, callKind: "trade", tradePolicy: "voice_and_video" });
    expect(r.voice.enabled && r.video.enabled).toBe(true);
  });

  it("매장 주문: 매장 설정을 따른다 (구매자 우회 없음)", () => {
    const off = resolveRoomCallChoice({
      ...base,
      callKind: "delivery",
      storeVoiceCallsEnabled: false,
      storeVideoCallsEnabled: false,
    });
    expect(off.showEntry).toBe(false);
    const voiceOnly = resolveRoomCallChoice({ ...base, callKind: "delivery", storeVideoCallsEnabled: false });
    expect(voiceOnly.voice.enabled).toBe(true);
    expect(voiceOnly.video).toEqual({ enabled: false, reason: "policy", reasonKey: "cm_call_choice_store_no_video" });
    const videoOnly = resolveRoomCallChoice({ ...base, callKind: "delivery", storeVoiceCallsEnabled: false });
    expect(videoOnly.voice).toEqual({ enabled: false, reason: "policy", reasonKey: "cm_call_choice_store_no_voice" });
    expect(videoOnly.video.enabled).toBe(true);
  });

  it("매장 설정 값 없음(옛 방): 기존 기본값처럼 허용", () => {
    const r = resolveRoomCallChoice({ ...base, callKind: "delivery" });
    expect(r.voice.enabled && r.video.enabled).toBe(true);
  });

  it("내가 차단: 두 줄 모두 회색 + 차단 해제 안내", () => {
    const r = resolveRoomCallChoice({ ...base, roomUnavailable: true, blockedByMe: true });
    expect(r.showEntry).toBe(true);
    expect(r.voice).toEqual({ enabled: false, reason: "unavailable", reasonKey: "cm_call_unavailable_blocked_by_me" });
    expect(r.video).toEqual({ enabled: false, reason: "unavailable", reasonKey: "cm_call_unavailable_blocked_by_me" });
  });

  it("발신 중: 통화 연결 중 안내", () => {
    const r = resolveRoomCallChoice({ ...base, outgoingDialLocked: true });
    expect(r.voice).toEqual({ enabled: false, reason: "unavailable", reasonKey: "cm_call_unavailable_dialing" });
  });

  it("방 규칙 회색 줄은 차단 상태여도 방 규칙 이유를 유지", () => {
    const r = resolveRoomCallChoice({
      ...base,
      callKind: "trade",
      tradePolicy: "voice_only",
      roomUnavailable: true,
    });
    expect(r.video).toEqual({ enabled: false, reason: "policy", reasonKey: "cm_call_choice_trade_voice_only" });
    expect(r.voice).toEqual({ enabled: false, reason: "unavailable", reasonKey: "cm_call_unavailable_generic" });
  });

  it("일반 1:1 서버 발신 게이트: 상대 통화 설정으로 막힘", () => {
    const r = resolveRoomCallChoice({
      ...base,
      directCallGate: { canStartVoice: false, canStartVideo: false, denyCode: "deny_privacy" },
    });
    expect(r.voice).toEqual({ enabled: false, reason: "unavailable", reasonKey: "cm_call_deny_privacy" });
    expect(r.video).toEqual({ enabled: false, reason: "unavailable", reasonKey: "cm_call_deny_privacy" });
  });

  it("발신 게이트는 일반 1:1 에만 (거래·주문은 서버 정책이 판정)", () => {
    const r = resolveRoomCallChoice({
      ...base,
      callKind: "trade",
      tradePolicy: "voice_and_video",
      directCallGate: { canStartVoice: false, canStartVideo: false },
    });
    expect(r.voice.enabled && r.video.enabled).toBe(true);
  });
});

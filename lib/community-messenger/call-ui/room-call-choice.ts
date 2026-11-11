/**
 * 방 안 통화 선택(헤더 📞 하나 → 「DIBAY 음성 · DIBAY 영상 · 휴대폰 전화」) 판정 — 단일 정의.
 * 설계: `docs/audit/call-entry-button-audit-2026-11-12.html` 2판 (Owner 승인 2026-11-12).
 *
 * - 헤더 📞 와 방 안 통화 기록 말풍선 다시 걸기가 같은 결과만 쓴다.
 * - 방 통화 규칙(거래 글 통화 설정 · 매장 통화 설정 · 그룹 보류)은 기존 `resolveMessengerRoomFeatureGate` 그대로 —
 *   서버 판정(`enforce-messenger-trade-room-call-policy.ts`)과 같은 규칙. 여기서 새 규칙을 만들지 않는다.
 * - 표시 전용: 발신 시작·서버 판정은 바꾸지 않는다 (서버 거부가 최종 방어선).
 */
import type { MessageKey } from "@/lib/i18n/messages";
import {
  resolveMessengerRoomFeatureGate,
  type MessengerDotMenuCallKind,
} from "@/lib/community-messenger/messenger-room-domain";
import {
  tradeChatCallPolicyAllowsVideo,
  tradeChatCallPolicyAllowsVoice,
  type TradeChatCallPolicy,
} from "@/lib/trade/trade-chat-call-policy";
import type { DirectCallDenyCode } from "@/lib/community-messenger/direct-call-permission";
import { DIRECT_CALL_DENY_MESSAGE_KEYS } from "@/lib/community-messenger/direct-call-permission-messages";
import { resolveDirectCallUnavailableReasonKey } from "@/lib/community-messenger/call-ui/direct-call-unavailable-reason";

/**
 * 통화 종류 한 줄의 상태.
 * - `policy`: 방 규칙(거래 글·매장 설정)으로 이 방에서는 이 종류를 쓸 수 없음 → 말풍선은 눌리지 않는 모양.
 * - `unavailable`: 지금 이 상대·방 상태로 막힘(차단·거절·발신 중·통화 설정) → 누르면 이유 안내.
 */
export type RoomCallChoiceRow =
  | { enabled: true }
  | { enabled: false; reason: "policy" | "unavailable"; reasonKey: MessageKey };

export type RoomCallChoice = {
  /** 헤더 📞 를 그릴지 — 그룹(보류)·방 사용 불가·방 규칙상 DIBAY 통화 0종이면 false */
  showEntry: boolean;
  voice: RoomCallChoiceRow;
  video: RoomCallChoiceRow;
};

export type RoomCallChoiceInput = {
  isGroupRoom: boolean;
  roomGloballyUsable: boolean;
  callKind: MessengerDotMenuCallKind;
  tradePolicy: TradeChatCallPolicy;
  storeVoiceCallsEnabled?: boolean | null;
  storeVideoCallsEnabled?: boolean | null;
  directCallGate?: { canStartVoice: boolean; canStartVideo: boolean; denyCode?: DirectCallDenyCode } | null;
  roomUnavailable: boolean;
  outgoingDialLocked: boolean;
  directMessageDenied?: "blocked" | "rejected_by_peer" | null;
  blockedByMe: boolean;
};

const ENABLED: RoomCallChoiceRow = { enabled: true };

function policyRow(reasonKey: MessageKey): RoomCallChoiceRow {
  return { enabled: false, reason: "policy", reasonKey };
}

function unavailableRow(reasonKey: MessageKey): RoomCallChoiceRow {
  return { enabled: false, reason: "unavailable", reasonKey };
}

export function resolveRoomCallChoice(input: RoomCallChoiceInput): RoomCallChoice {
  const gate = resolveMessengerRoomFeatureGate({
    callKind: input.callKind,
    tradeAllowCall: tradeChatCallPolicyAllowsVoice(input.tradePolicy),
    tradeVideoCallEnabled: tradeChatCallPolicyAllowsVideo(input.tradePolicy),
    deliveryAllowVoiceCall: input.storeVoiceCallsEnabled ?? undefined,
    deliveryAllowVideoCall: input.storeVideoCallsEnabled ?? undefined,
  });

  const groupOrUnusable = input.isGroupRoom || !input.roomGloballyUsable;
  if (groupOrUnusable || (!gate.allowVoiceCall && !gate.allowVideoCall)) {
    const hidden = policyRow("cm_call_unavailable_generic");
    return { showEntry: false, voice: hidden, video: hidden };
  }

  let voice: RoomCallChoiceRow = gate.allowVoiceCall
    ? ENABLED
    : policyRow(input.callKind === "delivery" ? "cm_call_choice_store_no_voice" : "cm_ui_trade_post_calls_disabled");
  let video: RoomCallChoiceRow = gate.allowVideoCall
    ? ENABLED
    : policyRow(input.callKind === "delivery" ? "cm_call_choice_store_no_video" : "cm_call_choice_trade_voice_only");

  /** §17-4 R-3 — 발신 중·방 사용 불가(차단·거절) 이유. 방 규칙으로 막힌 줄은 그 이유를 유지 */
  const unavailableKey = resolveDirectCallUnavailableReasonKey({
    outgoingDialLocked: input.outgoingDialLocked,
    roomUnavailable: input.roomUnavailable,
    directMessageDenied: input.directMessageDenied ?? null,
    blockedByMe: input.blockedByMe,
  });
  if (unavailableKey) {
    if (voice.enabled) voice = unavailableRow(unavailableKey);
    if (video.enabled) video = unavailableRow(unavailableKey);
    return { showEntry: true, voice, video };
  }

  /** 일반 1:1 — 서버가 내려준 발신 게이트(상대 통화 설정·차단). 발신 함수의 늦은 판정과 같은 값 */
  const g = input.callKind === "general" ? input.directCallGate : null;
  if (g) {
    const denyKey = DIRECT_CALL_DENY_MESSAGE_KEYS[g.denyCode ?? "deny_blocked"];
    if (voice.enabled && !g.canStartVoice) voice = unavailableRow(denyKey);
    if (video.enabled && !g.canStartVideo) video = unavailableRow(denyKey);
  }

  return { showEntry: true, voice, video };
}

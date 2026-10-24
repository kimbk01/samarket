/**
 * E-C3 — center dialog title / body / visual tone (web only).
 * Body keys stay on existing notice SSOT; titles are short product labels.
 * 문구 기준(UI·CTA 공통 기준 §1-2·§1-5 · W-9): 제목 = 상태 이름(마침표 없음), 본문 = 제목을 반복하지 않는
 * 설명 + 다음 행동(마침표). 「통화 중」 띄어쓰기, 사용자 본인을 3인칭으로 부르지 않는다.
 */

import type { MessageKey } from "@/lib/i18n/messages";
import {
  CALL_IN_APP_NOTICE_CENTER_EVENTS,
  type CallInAppNoticeEvent,
  isCallInAppNoticeCenterEvent,
} from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";

export type CallInAppNoticeCenterTone = "info" | "attention" | "failure";

export type CallInAppNoticeCenterCopy = {
  event: (typeof CALL_IN_APP_NOTICE_CENTER_EVENTS)[number];
  titleKey: MessageKey;
  bodyKey: MessageKey;
  fallbackTitleKo: string;
  fallbackTitleEn: string;
  fallbackBodyKo: string;
  fallbackBodyEn: string;
  tone: CallInAppNoticeCenterTone;
};

const CENTER_COPY: Record<(typeof CALL_IN_APP_NOTICE_CENTER_EVENTS)[number], CallInAppNoticeCenterCopy> = {
  no_answer: {
    event: "no_answer",
    titleKey: "cm_ui_call_notice_title_no_answer",
    bodyKey: "cm_ui_call_no_answer",
    fallbackTitleKo: "응답 없음",
    fallbackTitleEn: "No answer",
    fallbackBodyKo: "상대방이 전화를 받지 않았습니다. 잠시 후 다시 걸어 주세요.",
    fallbackBodyEn: "They didn't answer. Please try again later.",
    tone: "info",
  },
  peer_busy: {
    event: "peer_busy",
    titleKey: "cm_ui_call_notice_title_peer_busy",
    bodyKey: "cm_ui_call_peer_busy",
    fallbackTitleKo: "상대방 통화 중",
    fallbackTitleEn: "On another call",
    fallbackBodyKo: "상대방이 다른 통화 중입니다. 잠시 후 다시 걸어 주세요.",
    fallbackBodyEn: "The other person is currently on another call. Please try again later.",
    tone: "attention",
  },
  caller_busy: {
    event: "caller_busy",
    titleKey: "cm_ui_call_notice_title_caller_busy",
    bodyKey: "cm_ui_call_caller_busy",
    fallbackTitleKo: "이미 통화 중",
    fallbackTitleEn: "Already on a call",
    fallbackBodyKo: "지금 다른 통화 중이라 새 통화를 시작할 수 없습니다. 현재 통화를 끝낸 뒤 다시 걸어 주세요.",
    fallbackBodyEn: "You're already on another call, so a new call cannot be started. End the current call and try again.",
    tone: "attention",
  },
  call_failed: {
    event: "call_failed",
    titleKey: "cm_ui_call_notice_title_call_failed",
    bodyKey: "cm_ui_call_start_failed",
    fallbackTitleKo: "통화 연결 실패",
    fallbackTitleEn: "Call failed",
    fallbackBodyKo: "통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    fallbackBodyEn: "Could not start the call. Please try again.",
    tone: "failure",
  },
  peer_declined: {
    event: "peer_declined",
    titleKey: "cm_ui_call_notice_title_peer_declined",
    bodyKey: "cm_ui_peer_declined_call",
    fallbackTitleKo: "통화 거절",
    fallbackTitleEn: "Call declined",
    fallbackBodyKo: "상대방이 통화를 거절했습니다.",
    fallbackBodyEn: "The other person declined the call.",
    tone: "attention",
  },
};

export function getCallInAppNoticeCenterCopy(
  event: CallInAppNoticeEvent
): CallInAppNoticeCenterCopy | null {
  if (!isCallInAppNoticeCenterEvent(event)) return null;
  return CENTER_COPY[event as (typeof CALL_IN_APP_NOTICE_CENTER_EVENTS)[number]];
}

/**
 * E-C3 — center dialog title / body / visual tone (web only).
 * Body keys stay on existing notice SSOT; titles are short product labels.
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
    fallbackTitleKo: "응답하지 않음",
    fallbackTitleEn: "No answer",
    fallbackBodyKo: "상대방이 응답하지 않았습니다.",
    fallbackBodyEn: "The other person did not answer.",
    tone: "info",
  },
  peer_busy: {
    event: "peer_busy",
    titleKey: "cm_ui_call_notice_title_peer_busy",
    bodyKey: "cm_ui_call_peer_busy",
    fallbackTitleKo: "상대방 통화 중",
    fallbackTitleEn: "On another call",
    fallbackBodyKo: "상대방이 현재 통화중입니다.",
    fallbackBodyEn: "The other person is currently on another call.",
    tone: "attention",
  },
  caller_busy: {
    event: "caller_busy",
    titleKey: "cm_ui_call_notice_title_caller_busy",
    bodyKey: "cm_ui_call_caller_busy",
    fallbackTitleKo: "발신자 통화 중",
    fallbackTitleEn: "Already on a call",
    fallbackBodyKo: "다른 통화를 이용 중이라 새 통화를 시작할 수 없습니다.",
    fallbackBodyEn: "You are already on another call, so a new call cannot be started.",
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
    fallbackTitleKo: "상대방이 통화를 거절함",
    fallbackTitleEn: "Call declined",
    fallbackBodyKo: "상대방이 통화를 거절했습니다",
    fallbackBodyEn: "The other person declined the call",
    tone: "attention",
  },
};

export function getCallInAppNoticeCenterCopy(
  event: CallInAppNoticeEvent
): CallInAppNoticeCenterCopy | null {
  if (!isCallInAppNoticeCenterEvent(event)) return null;
  return CENTER_COPY[event as (typeof CALL_IN_APP_NOTICE_CENTER_EVENTS)[number]];
}

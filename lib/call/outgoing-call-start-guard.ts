"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { getActiveCallSessionCallId } from "@/lib/call/active-call-session";
import { isOutgoingCallStartBlocked } from "@/lib/call/call-action-lock";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";

export type InstantOutgoingCallGuardInput = {
  roomId?: string | null;
  peerUserId?: string | null;
  kind: CommunityMessengerCallKind;
};

export type InstantOutgoingCallGuardResult =
  | { ok: true }
  | { ok: false; blockedCallId: string; userMessage: string };

function alreadyInProgressMessage(): string {
  return safeTranslate(getRuntimeAppLanguage(), "cm_ui_call_already_in_progress", {
    fallbackKo: "현재 통화가 진행 중입니다.",
    fallbackEn: "A call is already in progress.",
  });
}

/** instant dial / redial 진입 전 — activeCallSession 또는 lock 존재 시 차단 */
export function guardInstantOutgoingCallStart(
  _input?: InstantOutgoingCallGuardInput,
): InstantOutgoingCallGuardResult {
  const activeCallId = getActiveCallSessionCallId();
  if (activeCallId) {
    return { ok: false, blockedCallId: activeCallId, userMessage: alreadyInProgressMessage() };
  }
  if (isOutgoingCallStartBlocked()) {
    const blockedCallId = getActiveCallSessionCallId();
    if (blockedCallId) {
      return { ok: false, blockedCallId, userMessage: alreadyInProgressMessage() };
    }
    return {
      ok: false,
      blockedCallId: "",
      userMessage: safeTranslate(getRuntimeAppLanguage(), "cm_ui_call_start_in_progress", {
        fallbackKo: "통화 연결 중입니다. 잠시만 기다려 주세요.",
        fallbackEn: "Connecting a call. Please wait.",
      }),
    };
  }
  return { ok: true };
}

export function navigateBlockedOutgoingCall(
  router: { push: (href: string) => void; replace?: (href: string) => void },
  blockedCallId: string,
): void {
  const sid = blockedCallId.trim();
  if (!sid) return;
  const href = `/community-messenger/calls/${encodeURIComponent(sid)}`;
  if (router.replace) {
    router.replace(href);
    return;
  }
  router.push(href);
}

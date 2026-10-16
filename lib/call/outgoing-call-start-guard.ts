"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  assertPhoneVerifiedForMessengerActionOrOpenSheet,
  resolveMessengerActionReturnPath,
} from "@/lib/auth/assert-phone-verified-for-messenger-action-client";
import { getActiveCallSessionCallId } from "@/lib/call/active-call-session";
import { isOutgoingCallStartBlocked } from "@/lib/call/call-action-lock";
import { readOwnLiveCall } from "@/lib/call/own-live-call";
import { bringNativeActiveCallToFront } from "@/lib/call/native/native-call-service";
import { alertOutgoingCallFailure } from "@/lib/community-messenger/call-outgoing-failure-alert";
import { logCallButtonState } from "@/lib/community-messenger/call-engine/call-engine-audit-log";
import { isDibayCallTerminalConsumedLocal } from "@/lib/community-messenger/incoming-call-state";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";

export type InstantOutgoingCallGuardInput = {
  roomId?: string | null;
  peerUserId?: string | null;
  kind: CommunityMessengerCallKind;
};

export type InstantOutgoingCallGuardResult =
  | { ok: true }
  | { ok: false; blockedCallId: string; userMessage: string; phoneVerificationRequired?: boolean };

export function isOutgoingCallPhoneVerificationRequired(result: {
  phoneVerificationRequired?: boolean;
}): boolean {
  return result.phoneVerificationRequired === true;
}

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
  if (!assertPhoneVerifiedForMessengerActionOrOpenSheet(resolveMessengerActionReturnPath())) {
    return { ok: false, blockedCallId: "", userMessage: "", phoneVerificationRequired: true };
  }
  const activeCallId = getActiveCallSessionCallId();
  if (activeCallId && !isDibayCallTerminalConsumedLocal(activeCallId)) {
    logCallButtonState({
      location: "guardInstantOutgoingCallStart",
      roomId: _input?.roomId,
      peerId: _input?.peerUserId,
    });
    return { ok: false, blockedCallId: activeCallId, userMessage: alreadyInProgressMessage() };
  }
  /**
   * V4/네이티브 lane — activeCallSession·lock 을 쓰지 않으므로 별도로 본다(통화가 울리는 중 두 번째 발신 차단).
   * 통화 화면은 네이티브(CallKit/전용 Activity)가 소유하므로 웹 통화 화면으로 이동하지 않고 안내만 한다.
   */
  const ownLive = readOwnLiveCall();
  if (ownLive?.source === "v4") {
    logCallButtonState({
      location: "guardInstantOutgoingCallStart",
      roomId: _input?.roomId,
      peerId: _input?.peerUserId,
    });
    /** 진행 중인 네이티브 통화 화면을 앞으로(앱 1.2+). 못 띄우면(이전 앱 등) 「통화 중」 안내. */
    const message = alreadyInProgressMessage();
    void bringNativeActiveCallToFront().then((shown) => {
      if (!shown) alertOutgoingCallFailure(message);
    });
    return { ok: false, blockedCallId: "", userMessage: "" };
  }
  if (isOutgoingCallStartBlocked()) {
    logCallButtonState({
      location: "guardInstantOutgoingCallStart",
      roomId: _input?.roomId,
      peerId: _input?.peerUserId,
    });
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

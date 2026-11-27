"use client";

import { create } from "zustand";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { useMessengerSnackbarStore } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  getCallInAppNoticeSpec,
  mapTerminalReasonToCallInAppNoticeEvent,
  shouldReplaceCallInAppNotice,
  type CallInAppNoticeEvent,
  type CallInAppNoticeSpec,
} from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";

export type CallInAppNoticeState = {
  event: CallInAppNoticeEvent;
  message: string;
  spec: CallInAppNoticeSpec;
  shownAt: number;
};

type Store = {
  current: CallInAppNoticeState | null;
  show: (input: {
    event: CallInAppNoticeEvent;
    messageOverride?: string | null;
  }) => void;
  dismiss: (event?: CallInAppNoticeEvent) => void;
  clear: () => void;
};

/**
 * `messageOverride` = 클라이언트가 **키로 만든** 문장만 넘긴다. 서버 `error` 문장은 넘기지 않는다
 * (`resolveCallStartServerErrorMessage` 를 쓴다). 코드 모양 값은 문장으로 쓰지 않고, 요청 제한 코드만 키 문구로 바꾼다.
 */
export function resolveCallInAppNoticeMessage(
  event: CallInAppNoticeEvent,
  messageOverride?: string | null
): string {
  const override = messageOverride?.trim();
  if (override && isRateLimitedErrorCode(override)) return callTooManyRequestsMessage();
  if (override && !isRawErrorCode(override)) return override;
  const spec = getCallInAppNoticeSpec(event);
  return safeTranslate(getRuntimeAppLanguage(), spec.messageKey);
}

function isRawErrorCode(text: string): boolean {
  return /^[a-z][a-z0-9_]*$/i.test(text.trim()) && !/\s/.test(text.trim());
}

/** 요청 제한 응답 코드(`rate_limited`·`*_rate_limited`) */
export function isRateLimitedErrorCode(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim().toLowerCase();
  return t === "rate_limited" || (isRawErrorCode(t) && t.endsWith("_rate_limited"));
}

export function callTooManyRequestsMessage(): string {
  return safeTranslate(getRuntimeAppLanguage(), "reaudit_call_too_many_requests");
}

/**
 * 통화 시작 API 실패 → 화면 문구. 서버 `error` 는 사건 판정에만 쓰고, 문장(서버 한국어·DB 오류 원문)은 화면에 쓰지 않는다.
 * 429·요청 제한 코드 → 「요청이 너무 많습니다」.
 */
export function resolveCallStartServerErrorMessage(
  serverError: string | null | undefined,
  httpStatus?: number | null
): string {
  const err = String(serverError ?? "").trim();
  if (httpStatus === 429 || isRateLimitedErrorCode(err)) return callTooManyRequestsMessage();
  /** 사건 판정은 예전처럼 서버 값 전체로(코드·문장 단어) — 화면 글자만 그 사건의 키 문구 */
  const event = inferCallInAppNoticeEventFromFailureMessage(err || "call_failed");
  return resolveCallInAppNoticeMessage(event, null);
}

/** 서버 `error` 가 코드 모양이면 그대로(사건 판정용), 아니면 null — 문장은 화면에 넘기지 않는다. */
export function callStartServerErrorCodeOrNull(serverError: string | null | undefined): string | null {
  const err = String(serverError ?? "").trim();
  return err && isRawErrorCode(err) ? err : null;
}

export function inferCallInAppNoticeEventFromFailureMessage(
  message: string
): CallInAppNoticeEvent {
  const mapped = mapTerminalReasonToCallInAppNoticeEvent(message);
  if (mapped) return mapped;
  const t = message.trim().toLowerCase();
  /** Caller-busy copy before peer — English shares "on another call" with peer wording. */
  if (
    t.includes("already on another call") ||
    t.includes("new call cannot") ||
    t.includes("다른 통화를 이용") ||
    t.includes("새 통화를 시작")
  ) {
    return "caller_busy";
  }
  if (
    t.includes("상대방이 현재 통화") ||
    t.includes("the other person is currently on another call") ||
    t.includes("통화중") ||
    t.includes("통화 중") ||
    t.includes("busy")
  ) {
    return "peer_busy";
  }
  if (t.includes("거절") || t.includes("declined")) {
    return "peer_declined";
  }
  if (t.includes("권한") || t.includes("permission") || t.includes("마이크") || t.includes("camera")) {
    return "permission_required";
  }
  if (t.includes("네트워크") || t.includes("network")) {
    return "network_warning";
  }
  return "call_failed";
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearDismissTimer(): void {
  if (dismissTimer != null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

export const useCallInAppNoticeStore = create<Store>((set, get) => ({
  current: null,
  show: (input) => {
    const spec = getCallInAppNoticeSpec(input.event);
    const current = get().current;
    if (current && !shouldReplaceCallInAppNotice(current.spec, spec)) {
      return;
    }
    clearDismissTimer();
    try {
      useMessengerSnackbarStore.getState().dismiss();
    } catch {
      /* store may be unavailable */
    }
    const message = resolveCallInAppNoticeMessage(input.event, input.messageOverride);
    set({
      current: {
        event: input.event,
        message,
        spec,
        shownAt: Date.now(),
      },
    });
    if (spec.durationMs != null && spec.durationMs > 0) {
      dismissTimer = setTimeout(() => {
        const live = get().current;
        if (live?.event === input.event) {
          set({ current: null });
        }
      }, spec.durationMs);
    }
  },
  dismiss: (event) => {
    const live = get().current;
    if (!live) return;
    if (event && live.event !== event) return;
    clearDismissTimer();
    set({ current: null });
  },
  clear: () => {
    clearDismissTimer();
    set({ current: null });
  },
}));

/** Canonical presenter API — Web Call in-app notice SSOT. */
export function showCallInAppNotice(input: {
  event: CallInAppNoticeEvent;
  messageOverride?: string | null;
}): void {
  useCallInAppNoticeStore.getState().show(input);
}

export function showCallInAppNoticeEvent(event: CallInAppNoticeEvent): void {
  showCallInAppNotice({ event });
}

export function dismissCallInAppNotice(event?: CallInAppNoticeEvent): void {
  useCallInAppNoticeStore.getState().dismiss(event);
}

export function showCallInAppNoticeFromFailureMessage(message: string): void {
  const text = message.trim();
  if (!text) return;
  const event = inferCallInAppNoticeEventFromFailureMessage(text);
  showCallInAppNotice({
    event,
    messageOverride: isRateLimitedErrorCode(text) ? callTooManyRequestsMessage() : isRawErrorCode(text) ? null : text,
  });
}

export function showCallInAppNoticeFromTerminalReason(reason: string | null | undefined): void {
  const event = mapTerminalReasonToCallInAppNoticeEvent(reason);
  if (!event) return;
  showCallInAppNoticeEvent(event);
}

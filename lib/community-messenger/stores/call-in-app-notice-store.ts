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

const FALLBACKS: Record<CallInAppNoticeEvent, { ko: string; en: string }> = {
  peer_busy: {
    ko: "상대방이 현재 통화중입니다.",
    en: "The other person is currently on another call.",
  },
  peer_declined: {
    ko: "상대방이 통화를 거절했습니다",
    en: "The other person declined the call",
  },
  call_failed: {
    ko: "통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    en: "Could not start the call. Please try again.",
  },
  remote_ended: {
    ko: "통화가 종료되었습니다",
    en: "Call ended",
  },
  missed: {
    ko: "부재중 알림",
    en: "Missed call",
  },
  reconnecting: {
    ko: "다시 연결하는 중…",
    en: "Reconnecting…",
  },
  network_warning: {
    ko: "네트워크 상태를 확인해 주세요.",
    en: "Check your network connection.",
  },
  permission_required: {
    ko: "마이크 권한이 필요합니다",
    en: "Microphone access required",
  },
};

export function resolveCallInAppNoticeMessage(
  event: CallInAppNoticeEvent,
  messageOverride?: string | null
): string {
  const override = messageOverride?.trim();
  if (override && !isRawErrorCode(override)) return override;
  const spec = getCallInAppNoticeSpec(event);
  const fb = FALLBACKS[event];
  return safeTranslate(getRuntimeAppLanguage(), spec.messageKey, {
    fallbackKo: fb.ko,
    fallbackEn: fb.en,
  });
}

function isRawErrorCode(text: string): boolean {
  return /^[a-z][a-z0-9_]*$/i.test(text.trim()) && !/\s/.test(text.trim());
}

export function inferCallInAppNoticeEventFromFailureMessage(
  message: string
): CallInAppNoticeEvent {
  const mapped = mapTerminalReasonToCallInAppNoticeEvent(message);
  if (mapped) return mapped;
  const t = message.trim().toLowerCase();
  if (t.includes("통화중") || t.includes("on another call") || t.includes("busy")) {
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
    messageOverride: isRawErrorCode(text) ? null : text,
  });
}

export function showCallInAppNoticeFromTerminalReason(reason: string | null | undefined): void {
  const event = mapTerminalReasonToCallInAppNoticeEvent(reason);
  if (!event) return;
  showCallInAppNoticeEvent(event);
}

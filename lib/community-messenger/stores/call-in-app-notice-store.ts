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

/** [다시 걸기] 에 필요한 최소 발신 컨텍스트 — 팝업이 이전 세션을 다시 활성화하지 않도록 새 발신만 연다 */
export type CallInAppNoticeRedialContext = {
  roomId: string | null;
  peerUserId: string | null;
  peerLabel: string | null;
  kind: "voice" | "video";
};

export type CallInAppNoticeState = {
  event: CallInAppNoticeEvent;
  message: string;
  title: string | null;
  spec: CallInAppNoticeSpec;
  shownAt: number;
  /** 팝업을 만든 통화 — 늦은 이벤트·중복 판정 키 */
  callId: string | null;
  redial: CallInAppNoticeRedialContext | null;
};

type Store = {
  current: CallInAppNoticeState | null;
  show: (input: {
    event: CallInAppNoticeEvent;
    messageOverride?: string | null;
    callId?: string | null;
    redial?: CallInAppNoticeRedialContext | null;
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
  peer_no_answer: {
    ko: "상대방이 응답하지 않습니다.",
    en: "The other person isn't answering.",
  },
  peer_unreachable: {
    ko: "상대방에게 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    en: "Can't reach the other person right now. Please try again later.",
  },
  call_disconnected: {
    ko: "통화 연결이 끊어졌습니다.",
    en: "The call was disconnected.",
  },
  self_busy: {
    ko: "이미 다른 통화가 진행 중입니다. 현재 통화를 종료한 뒤 다시 시도해 주세요.",
    en: "You're already on another call. End it and try again.",
  },
};

const TITLE_FALLBACKS: Partial<Record<CallInAppNoticeEvent, { ko: string; en: string }>> = {
  peer_busy: { ko: "상대방 통화 중", en: "On another call" },
  peer_declined: { ko: "통화 거절", en: "Call declined" },
  call_failed: { ko: "통화 연결 실패", en: "Call failed" },
  peer_no_answer: { ko: "응답 없음", en: "No answer" },
  peer_unreachable: { ko: "통화 연결 실패", en: "Call failed" },
  call_disconnected: { ko: "통화 종료", en: "Call ended" },
  self_busy: { ko: "통화 중", en: "Already on a call" },
};

export function resolveCallInAppNoticeTitle(event: CallInAppNoticeEvent): string | null {
  const spec = getCallInAppNoticeSpec(event);
  if (!spec.titleKey) return null;
  const fb = TITLE_FALLBACKS[event] ?? { ko: "", en: "" };
  return safeTranslate(getRuntimeAppLanguage(), spec.titleKey, { fallbackKo: fb.ko, fallbackEn: fb.en });
}

/**
 * callId 범위 — 사용자가 닫았거나 새 통화가 시작된 callId 의 늦은 이벤트는 팝업을 다시 띄우지 않는다.
 * (메모리 상한: 최근 64개)
 */
const retiredNoticeCallIds: string[] = [];
let activeNoticeScopeCallId: string | null = null;

function retireNoticeCallId(callId: string | null | undefined): void {
  const id = callId?.trim();
  if (!id || retiredNoticeCallIds.includes(id)) return;
  retiredNoticeCallIds.push(id);
  if (retiredNoticeCallIds.length > 64) retiredNoticeCallIds.shift();
}

export function isCallInAppNoticeCallIdRetired(callId: string | null | undefined): boolean {
  const id = callId?.trim();
  return Boolean(id && retiredNoticeCallIds.includes(id));
}

/** 새 발신·수신이 시작될 때 호출 — 이전 통화의 팝업을 닫고 그 callId 의 늦은 이벤트를 막는다 */
export function beginCallInAppNoticeScope(callId: string | null | undefined): void {
  const id = callId?.trim() || null;
  if (activeNoticeScopeCallId && activeNoticeScopeCallId !== id) retireNoticeCallId(activeNoticeScopeCallId);
  activeNoticeScopeCallId = id;
  const live = useCallInAppNoticeStore.getState().current;
  if (live?.callId && live.callId !== id) {
    retireNoticeCallId(live.callId);
    useCallInAppNoticeStore.getState().clear();
  }
}

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
  if (t.includes("이미 다른 통화") || t.includes("already on another call")) {
    return "self_busy";
  }
  if (t.includes("응답하지 않") || t.includes("isn't answering")) {
    return "peer_no_answer";
  }
  if (t.includes("연결할 수 없") || t.includes("can't reach")) {
    return "peer_unreachable";
  }
  if (t.includes("통화중") || t.includes("통화 중") || t.includes("on another call") || t.includes("busy")) {
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
    const callId = input.callId?.trim() || null;
    /** 이미 끝나 닫힌 통화·대체된 통화의 늦은 이벤트 → 무시 */
    if (callId && isCallInAppNoticeCallIdRetired(callId)) return;
    if (callId && activeNoticeScopeCallId && activeNoticeScopeCallId !== callId) return;
    const current = get().current;
    /** 같은 통화·같은 종류 중복 팝업 금지 */
    if (current && current.event === input.event && current.callId === callId && spec.presentation === "DIALOG") {
      return;
    }
    if (current && !shouldReplaceCallInAppNotice(current.spec, spec)) {
      return;
    }
    clearDismissTimer();
    try {
      useMessengerSnackbarStore.getState().dismiss();
    } catch {
      /* store may be unavailable */
    }
    /**
     * 팝업은 계약 문구(제목·설명)를 쓴다 — 예전 배너용 문장 override 가 새 문구를 덮지 않게.
     * 단 일반 실패(call_failed)는 서버가 준 구체 사유 문장을 유지.
     */
    const override =
      spec.presentation === "DIALOG" && input.event !== "call_failed" ? null : input.messageOverride;
    const message = resolveCallInAppNoticeMessage(input.event, override);
    set({
      current: {
        event: input.event,
        message,
        title: resolveCallInAppNoticeTitle(input.event),
        spec,
        shownAt: Date.now(),
        callId,
        redial: spec.retryable ? (input.redial ?? null) : null,
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
    /** 닫은 팝업의 callId 는 은퇴 — 늦은 terminal 이벤트가 같은 팝업을 다시 띄우지 않는다 */
    if (live.spec.presentation === "DIALOG") retireNoticeCallId(live.callId);
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
  callId?: string | null;
  redial?: CallInAppNoticeRedialContext | null;
}): void {
  useCallInAppNoticeStore.getState().show(input);
}

export function showCallInAppNoticeEvent(event: CallInAppNoticeEvent): void {
  showCallInAppNotice({ event });
}

export function dismissCallInAppNotice(event?: CallInAppNoticeEvent): void {
  useCallInAppNoticeStore.getState().dismiss(event);
}

/**
 * 마지막 발신 시도 컨텍스트 — 세션 생성 전 실패(통화 중·연결 실패 등)는 callId 가 없으므로
 * `launchOutgoingDirectCall` 이 시작 시 기록하고, 실패 팝업의 [다시 걸기]가 이 값으로 새 발신을 연다.
 */
let lastOutgoingDialContext: CallInAppNoticeRedialContext | null = null;

export function rememberCallInAppNoticeOutgoingDial(ctx: CallInAppNoticeRedialContext | null): void {
  lastOutgoingDialContext = ctx;
}

export function showCallInAppNoticeFromFailureMessage(message: string): void {
  const text = message.trim();
  if (!text) return;
  const event = inferCallInAppNoticeEventFromFailureMessage(text);
  showCallInAppNotice({
    event,
    messageOverride: isRawErrorCode(text) ? null : text,
    redial: lastOutgoingDialContext,
  });
}

export function showCallInAppNoticeFromTerminalReason(
  reason: string | null | undefined,
  opts?: {
    callId?: string | null;
    direction?: "outgoing" | "incoming" | null;
    redial?: CallInAppNoticeRedialContext | null;
  }
): void {
  const event = mapTerminalReasonToCallInAppNoticeEvent(reason, { direction: opts?.direction ?? null });
  if (!event) return;
  showCallInAppNotice({ event, callId: opts?.callId ?? null, redial: opts?.redial ?? null });
}

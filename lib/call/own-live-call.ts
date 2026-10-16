"use client";

import { useSyncExternalStore } from "react";
import {
  getActiveCallSessionCallId,
  isLiveActiveCallPhase,
  readActiveCallSessionSnapshot,
  subscribeActiveCallSession,
} from "@/lib/call/active-call-session";
import { readCallActionLockSnapshot, subscribeCallActionLock } from "@/lib/call/call-action-lock";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import { isCallV4TerminalPhase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { isDibayCallTerminalConsumedLocal } from "@/lib/community-messenger/incoming-call-state";

/**
 * 「내 통화 진행 중」 단일 판정 — 웹 세션(activeCallSession)·발신 lock·V4/네이티브 lane(call-v4-store) 를 함께 본다.
 * 통화 버튼·발신 확인 팝업·발신 guard 가 같은 값을 써서, 통화가 울리거나 진행 중일 때 두 번째 발신(팝업)을 막는다.
 * (V4/네이티브 lane 은 activeCallSession·lock 을 쓰지 않아 기존 guard 가 보지 못했다.)
 */
export type OwnLiveCall = {
  /** 서버 세션 id — 만드는 중(creating)이면 아직 null */
  callId: string | null;
  source: "session" | "v4" | "lock";
};

function readV4LiveCall(): OwnLiveCall | null {
  const st = useCallV4Store.getState();
  const phaseLive = st.phase !== "idle" && !isCallV4TerminalPhase(st.phase);
  if (!phaseLive && st.canStartNewCall) return null;
  const callId = st.identity?.callId?.trim() || null;
  if (callId && isDibayCallTerminalConsumedLocal(callId)) return null;
  return { callId, source: "v4" };
}

export function readOwnLiveCall(): OwnLiveCall | null {
  const session = readActiveCallSessionSnapshot();
  const sid = getActiveCallSessionCallId();
  if (session && sid && isLiveActiveCallPhase(session.phase) && !isDibayCallTerminalConsumedLocal(sid)) {
    return { callId: sid, source: "session" };
  }
  const v4 = readV4LiveCall();
  if (v4) return v4;
  const lock = readCallActionLockSnapshot();
  if (lock) return { callId: lock.callId, source: "lock" };
  return null;
}

function snapshotKey(): string {
  const live = readOwnLiveCall();
  return live ? `${live.source}:${live.callId ?? ""}` : "";
}

export function subscribeOwnLiveCall(onChange: () => void): () => void {
  const unsubSession = subscribeActiveCallSession(onChange);
  const unsubLock = subscribeCallActionLock(onChange);
  const unsubV4 = useCallV4Store.subscribe(onChange);
  return () => {
    unsubSession();
    unsubLock();
    unsubV4();
  };
}

/** 통화 버튼 UI 용 — 진행 중이면 non-null */
export function useOwnLiveCall(): OwnLiveCall | null {
  useSyncExternalStore(subscribeOwnLiveCall, snapshotKey, () => "");
  return readOwnLiveCall();
}

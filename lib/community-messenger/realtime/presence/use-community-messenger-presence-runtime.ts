"use client";

/**
 * D1 2단계 (Owner 승인 2026-11-19) — 내 접속 상태 보고 (레거시 Telegram 구조).
 *
 * 이전: 전역 Realtime 채널 `community-messenger:presence` 에 12초마다 track(접속자 N² 전파) +
 *       12초마다 HTTP 하트비트(DB upsert). 채널 정상 판정이 그 신호에 묶여 있었다.
 * 지금:
 *  - **전환은 즉시** 1회 POST(`transition: true`): 앞화면 진입 · 백그라운드 · 유휴에서 복귀 · 세션 종료(beacon).
 *    서버가 그 사용자 비공개 토픽(`cm-presence-user:<id>`)에 1건 발행 → 실시간으로 보고 있는 상대만 받는다.
 *  - 앞화면이고 사람이 쓰는 동안만 **60초 keepalive** POST(발행 없음) — 강제 종료·연결 끊김은 판정 창(150초) 뒤 오프라인.
 *  - 손대지 않고 켜 둔 화면은 keepalive 정지(방 밖 5분 · 방 안 30분), 활동 시 즉시 재개.
 *  - 전역 presence 채널 구독·track 없음 → 채널 정상 판정·폴백 폴링과 무관.
 * 푸시 표시 판단은 1단계(#485)에서 presence 와 분리됐다(서버 항상 발송 · 기기 판단).
 *
 * 근거: docs/audit/supabase-request-surge-2026-11-18/d1-presence-push-structure-analysis-2026-11-19.md
 */

import { useEffect, useRef } from "react";
import { recordRouteEntryElapsedMetric, recordRouteEntryMetric } from "@/lib/runtime/samarket-runtime-debug";
import { noteTradeChatRoomPresenceReadyForShellBreakdown } from "@/lib/trade/trade-chat-room-shell-breakdown-perf";
import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";
import { SAMARKET_PRESENCE_KEEPALIVE_MS } from "@/lib/community-messenger/presence/presence-policy";
import { isPresenceHeartbeatIdle } from "@/lib/community-messenger/realtime/presence/presence-heartbeat-idle";

const ACTIVITY_THROTTLE_MS = 20_000;
/** 같은 가시성으로 이 간격 안에 keepalive 를 다시 보내지 않는다(focus·online 이 겹칠 때). 전환은 항상 즉시. */
const PRESENCE_HTTP_MIN_GAP_MS = 5_000;
const PRESENCE_ENDPOINT = "/api/community-messenger/presence";

let runtimeRefCount = 0;
let runtimeUserId = "";
let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
let presenceCleanup: (() => void) | null = null;
let lastActivityMs = Date.now();
let lastActivityThrottleAt = 0;
let lastPostAt = 0;
let lastPostVisibility: "foreground" | "background" | null = null;
/** 유휴로 keepalive 가 멈춘 상태 — 다음 활동에서 전환 POST + 주기 재개 */
let keepaliveIdlePaused = false;
let resumeFromIdle: (() => void) | null = null;

function nowIso() {
  return new Date().toISOString();
}

function currentDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function activeRoomIdFromPathname(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/community-messenger\/rooms\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function keepaliveIdleNow(): boolean {
  return isPresenceHeartbeatIdle({
    nowMs: Date.now(),
    lastActivityMs,
    inRoom: activeRoomIdFromPathname() != null,
  });
}

function clearKeepaliveTimer() {
  if (keepaliveTimer != null) {
    clearTimeout(keepaliveTimer);
    keepaliveTimer = null;
  }
}

/** 메시지 전송 등 앱 동작 — 유휴 정지 중이면 즉시 재개 */
export function bumpCommunityMessengerPresenceActivity(_reason?: string): void {
  const t = Date.now();
  lastActivityMs = t;
  lastActivityThrottleAt = t;
  if (keepaliveIdlePaused) resumeFromIdle?.();
}

function recordActivity() {
  const t = Date.now();
  if (keepaliveIdlePaused) {
    lastActivityThrottleAt = t;
    lastActivityMs = t;
    resumeFromIdle?.();
    return;
  }
  if (t - lastActivityThrottleAt < ACTIVITY_THROTTLE_MS) return;
  lastActivityThrottleAt = t;
  lastActivityMs = t;
}

function logPresenceHttpFailure(kind: string, status: number) {
  if (!isDebugMessengerEnabled()) return;
  try {
    console.warn("[cm-presence-client]", { kind, status, runtimeUserIdLen: runtimeUserId.length });
  } catch {
    /* ignore */
  }
}

/**
 * @param transition true = 상태 전환(서버가 사용자 토픽에 발행). false = keepalive(DB 갱신만).
 * @returns 실제로 보냈으면 true
 */
function postPresence(transition: boolean): boolean {
  const now = Date.now();
  const appVisibility = currentDocumentVisible() ? "foreground" : "background";
  if (!transition) {
    if (appVisibility === "foreground" && keepaliveIdleNow()) return false;
    if (
      lastPostAt > 0 &&
      appVisibility === lastPostVisibility &&
      now - lastPostAt < PRESENCE_HTTP_MIN_GAP_MS
    ) {
      return false;
    }
  }
  lastPostAt = now;
  lastPostVisibility = appVisibility;
  const payload = {
    lastPingAt: nowIso(),
    lastActivityAt: new Date(lastActivityMs).toISOString(),
    appVisibility,
    activeRoomId: appVisibility === "foreground" ? activeRoomIdFromPathname() : null,
    transition,
  };
  /** 백그라운드 전환은 페이지 freeze/hide 에도 살아남도록 keepalive fetch */
  void fetch(PRESENCE_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...(appVisibility === "background" ? { keepalive: true } : {}),
  })
    .then((res) => {
      if (!res.ok) logPresenceHttpFailure("presence_post_failed", res.status);
    })
    .catch(() => {});
  return true;
}

function postSessionEndBeacon(lastSeenAt: string) {
  if (typeof navigator === "undefined") return;
  const body = JSON.stringify({ lastSeenAt, sessionEnd: true, transition: true });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.(PRESENCE_ENDPOINT, blob)) return;
  } catch {
    /* fall through */
  }
  void fetch(PRESENCE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "include",
  }).catch(() => {});
}

function ensurePresenceRuntime(userId: string) {
  if (presenceCleanup && runtimeUserId === userId) return;
  presenceCleanup?.();
  runtimeUserId = userId;
  lastActivityMs = Date.now();
  lastActivityThrottleAt = 0;
  lastPostAt = 0;
  lastPostVisibility = null;
  keepaliveIdlePaused = false;

  /** 마지막 POST 기준 60초 — 전환 POST 가 있어도 간격이 주기를 넘지 않게 앵커링 */
  const scheduleKeepalive = () => {
    clearKeepaliveTimer();
    if (!currentDocumentVisible()) return;
    if (keepaliveIdleNow()) {
      keepaliveIdlePaused = true;
      return;
    }
    keepaliveIdlePaused = false;
    const sinceLast = lastPostAt > 0 ? Date.now() - lastPostAt : 0;
    const delayMs = Math.min(
      SAMARKET_PRESENCE_KEEPALIVE_MS,
      Math.max(0, SAMARKET_PRESENCE_KEEPALIVE_MS - sinceLast)
    );
    keepaliveTimer = setTimeout(() => {
      keepaliveTimer = null;
      if (!currentDocumentVisible()) return;
      if (keepaliveIdleNow()) {
        keepaliveIdlePaused = true;
        return;
      }
      postPresence(false);
      scheduleKeepalive();
    }, delayMs);
  };

  resumeFromIdle = () => {
    if (!keepaliveIdlePaused || !currentDocumentVisible()) return;
    keepaliveIdlePaused = false;
    /** 판정 창이 지나 상대에게 오프라인으로 보였을 수 있다 → 전환으로 보낸다 */
    postPresence(true);
    scheduleKeepalive();
  };

  const onVisibility = () => {
    if (currentDocumentVisible()) {
      const wasHidden = lastPostVisibility === "background";
      lastActivityMs = Date.now();
      keepaliveIdlePaused = false;
      postPresence(wasHidden || lastPostAt === 0);
      scheduleKeepalive();
    } else {
      clearKeepaliveTimer();
      postPresence(true);
    }
  };
  const onFocusOrOnline = () => {
    if (!currentDocumentVisible()) return;
    recordActivity();
    /** 오프라인 동안 놓친 keepalive 보충 — 최소 간격 안이면 생략 */
    postPresence(false);
    scheduleKeepalive();
  };
  const onPageHide = () => {
    clearKeepaliveTimer();
    postSessionEndBeacon(nowIso());
  };
  const onActivity = () => recordActivity();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocusOrOnline);
  window.addEventListener("online", onFocusOrOnline);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("pointerdown", onActivity, { capture: true, passive: true });
  document.addEventListener("keydown", onActivity);
  /** 메신저 목록·타임라인은 안쪽 스크롤 상자라 window scroll 이 오지 않는다 → capture 로 받는다 */
  document.addEventListener("scroll", onActivity, { capture: true, passive: true });

  /** 시작 = 앞화면 진입 전환 */
  if (currentDocumentVisible()) {
    postPresence(true);
    scheduleKeepalive();
  }

  presenceCleanup = () => {
    clearKeepaliveTimer();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocusOrOnline);
    window.removeEventListener("online", onFocusOrOnline);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("pointerdown", onActivity, true);
    document.removeEventListener("keydown", onActivity);
    document.removeEventListener("scroll", onActivity, true);
    resumeFromIdle = null;
    keepaliveIdlePaused = false;
  };
}

function releasePresenceRuntime() {
  if (runtimeRefCount > 0) return;
  presenceCleanup?.();
  presenceCleanup = null;
  runtimeUserId = "";
}

export function useCommunityMessengerPresenceRuntime(userId: string | null | undefined): void {
  const presenceEffectStartRecordedRef = useRef<string | null>(null);
  const presenceEffectEndRecordedRef = useRef<string | null>(null);
  const presenceEffectCountRef = useRef(0);
  useEffect(() => {
    const id = typeof userId === "string" ? userId.trim() : "";
    if (!id) return;
    presenceEffectCountRef.current += 1;
    recordRouteEntryMetric("messenger_room_entry", "presence_effect_count", presenceEffectCountRef.current);
    if (presenceEffectStartRecordedRef.current !== id) {
      presenceEffectStartRecordedRef.current = id;
      recordRouteEntryElapsedMetric("messenger_room_entry", "presence_effect_start_ms");
      noteTradeChatRoomPresenceReadyForShellBreakdown();
    }
    runtimeRefCount += 1;
    ensurePresenceRuntime(id);
    if (presenceEffectEndRecordedRef.current !== id) {
      presenceEffectEndRecordedRef.current = id;
      recordRouteEntryElapsedMetric("messenger_room_entry", "presence_effect_end_ms");
    }
    return () => {
      runtimeRefCount = Math.max(0, runtimeRefCount - 1);
      releasePresenceRuntime();
    };
  }, [userId]);
}

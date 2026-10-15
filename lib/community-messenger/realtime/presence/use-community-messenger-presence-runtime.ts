"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";
import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";
import { deriveLivePresenceFromSignals, mergePresenceStates } from "@/lib/community-messenger/presence/presence-policy";
import { recordRouteEntryElapsedMetric, recordRouteEntryMetric } from "@/lib/runtime/samarket-runtime-debug";
import { noteTradeChatRoomPresenceReadyForShellBreakdown } from "@/lib/trade/trade-chat-room-shell-breakdown-perf";
import {
  cmDebugTailUserId,
  pushCmBrowserDebugEvent,
} from "@/lib/community-messenger/realtime/cm-browser-debug-buffer";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import { runDevSafeSingleFlight } from "@/lib/dev/dev-safe-dedupe";
import { cmRtPresenceIsolatedError } from "@/lib/community-messenger/realtime/cm-rt-loop-guard";
import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";

type PresencePayload = {
  userId?: unknown;
  state?: unknown;
  updatedAt?: unknown;
};

const HEARTBEAT_MS = 12_000;
const ACTIVITY_THROTTLE_MS = 20_000;

let runtimeRefCount = 0;
let runtimeUserId = "";
let presenceHeartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let presenceCleanup: (() => void) | null = null;
let lastActivityMs = Date.now();
let lastActivityThrottleAt = 0;
let channelSubscribed = false;
const PRESENCE_RUNTIME_SCOPE = "community-messenger:presence-runtime";

function nowIso() {
  return new Date().toISOString();
}

export function bumpCommunityMessengerPresenceActivity(_reason?: string): void {
  const t = Date.now();
  lastActivityMs = t;
  lastActivityThrottleAt = t;
}

function maybeRecordThrottledActivity() {
  const t = Date.now();
  if (t - lastActivityThrottleAt < ACTIVITY_THROTTLE_MS) return;
  lastActivityThrottleAt = t;
  lastActivityMs = t;
}

function currentDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function clearPresenceHeartbeatTimer() {
  if (presenceHeartbeatTimer != null) {
    clearTimeout(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }
}

let lastPresenceHttpPostAt = 0;
let lastPresenceHttpPostVisibility: "foreground" | "background" | null = null;
/**
 * 같은 가시성으로 이 간격 안에 다시 POST 하지 않는다 — SUBSCRIBED·focus·online 등 off-cadence 트리거가
 * 12s 하트비트와 겹쳐 요청이 2배가 되지 않게 한다. 가시성 전환(foreground↔background)은 항상 즉시 전송.
 */
const PRESENCE_HTTP_MIN_GAP_MS = 5_000;

function logPresenceHttpFailure(kind: string, args: { status: number; bodySnippet: string; deltaMs: number; payloadNote?: string }) {
  if (!isDebugMessengerEnabled()) return;
  try {
    // eslint-disable-next-line no-console -- presence 400/네트워크 진단
    console.warn("[cm-presence-client]", {
      kind,
      ...args,
      viewerUserIdNull: !runtimeUserId,
      runtimeUserIdLen: runtimeUserId.length,
    });
  } catch {
    /* ignore */
  }
  pushCmBrowserDebugEvent({
    label: "cm-presence-client",
    scope: null,
    channelName: null,
    reason: kind,
    status: String(args.status),
    bodySnippet: args.bodySnippet ? args.bodySnippet.slice(0, 2000) : null,
    payload: { deltaMs: args.deltaMs, payloadNote: args.payloadNote ?? null },
    stopSourceStack: null,
    fingerprint: null,
    userIdTail: cmDebugTailUserId(runtimeUserId),
  });
}

function isTerminalPresencePostBody(body: Record<string, unknown>): boolean {
  if (body.sessionEnd === true) return true;
  if (body.appVisibility === "background") return true;
  return false;
}

function persistLastSeenSessionEnd(lastSeenAt: string) {
  if (typeof navigator === "undefined") return;
  const body = JSON.stringify({ lastSeenAt, sessionEnd: true });
  try {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon?.("/api/community-messenger/presence", blob);
  } catch {
    void fetch("/api/community-messenger/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "include",
    })
      .then(async (res) => {
        if (res.ok) return;
        const bodySnippet = (await res.text().catch(() => "")).slice(0, 2000);
        logPresenceHttpFailure("session_end_fetch_failed", {
          status: res.status,
          bodySnippet,
          deltaMs: -1,
          payloadNote: "sessionEnd:true",
        });
      })
      .catch(() => {});
  }
}

function activeRoomIdFromPathname(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/community-messenger\/rooms\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * DB `last_ping_at`·`app_visibility` 하트비트 — Realtime 채널 구독 여부와 **무관하게** 보낸다
 * (채널이 끊겨도 서버 presence·notification-presence-policy 가 stale 해지지 않도록).
 * @returns 실제로 POST 를 보냈으면 true (최소 간격으로 생략되면 false)
 */
function postPresenceHeartbeatHttp(): boolean {
  const now = Date.now();
  const appVisibility = currentDocumentVisible() ? "foreground" : "background";
  if (
    lastPresenceHttpPostAt > 0 &&
    appVisibility === lastPresenceHttpPostVisibility &&
    now - lastPresenceHttpPostAt < PRESENCE_HTTP_MIN_GAP_MS
  ) {
    return false;
  }
  const deltaMs = lastPresenceHttpPostAt ? now - lastPresenceHttpPostAt : -1;
  lastPresenceHttpPostAt = now;
  lastPresenceHttpPostVisibility = appVisibility;
  if (deltaMs >= 0 && deltaMs < 90) {
    if (isDebugMessengerEnabled()) {
      try {
        // eslint-disable-next-line no-console -- 연속 POST(중복/race) 힌트
        console.warn("[cm-presence-client]", {
          kind: "heartbeat_burst",
          deltaMs,
          runtimeUserIdLen: runtimeUserId.length,
        });
      } catch {
        /* ignore */
      }
    }
  }
  const payload = {
    lastPingAt: nowIso(),
    lastActivityAt: new Date(lastActivityMs).toISOString(),
    appVisibility,
    activeRoomId: appVisibility === "foreground" ? activeRoomIdFromPathname() : null,
  } as const;
  const bodyObj = payload as unknown as Record<string, unknown>;
  // NEW-22: 백그라운드 전환 신호는 페이지 freeze/hide 에도 살아남도록 keepalive 로 보낸다
  // (realtime 채널이 끊겨 있어도 서버 last_ping_at/background 가 갱신됨).
  const terminalBody = isTerminalPresencePostBody(bodyObj);
  const postOnce = () =>
    fetch("/api/community-messenger/presence", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      ...(terminalBody ? { keepalive: true } : {}),
    }).then(async (res) => {
      if (res.ok) return true;
      const bodySnippet = (await res.text().catch(() => "")).slice(0, 2000);
      logPresenceHttpFailure("heartbeat_http_failed", {
        status: res.status,
        bodySnippet,
        deltaMs,
        payloadNote: JSON.stringify(payload),
      });
      return false;
    });

  if (!isDevSafeMode() || isTerminalPresencePostBody(bodyObj)) {
    void postOnce().catch(() => {});
    return true;
  }

  const surface = payload.appVisibility === "foreground" ? "heartbeat-fg" : "heartbeat-bg";
  const dedupeKey = `${runtimeUserId}|cm-presence|${surface}`;
  void runDevSafeSingleFlight(dedupeKey, 90_000, () => postOnce(), {
    onlyCacheIf: (ok) => ok === true,
  }).catch(() => {});
  return true;
}

function parseIncomingState(raw: unknown): CommunityMessengerPresenceState {
  if (raw === "online" || raw === "away" || raw === "offline") return raw;
  return "offline";
}

function aggregatePresenceState(raw: Record<string, unknown>) {
  const next: Record<
    string,
    {
      userId: string;
      state: CommunityMessengerPresenceState;
      lastSeenAt: string | null;
      updatedAt: string | null;
    }
  > = {};
  for (const entries of Object.values(raw)) {
    if (!Array.isArray(entries)) continue;
    for (const item of entries) {
      const payload = item as PresencePayload;
      const userId = typeof payload.userId === "string" ? payload.userId.trim() : "";
      if (!userId) continue;
      const incomingState = parseIncomingState(payload.state);
      const updatedAt = typeof payload.updatedAt === "string" ? payload.updatedAt : null;
      const prev = next[userId];
      if (!prev) {
        next[userId] = {
          userId,
          state: incomingState,
          lastSeenAt: null,
          updatedAt,
        };
        continue;
      }
      const merged = mergePresenceStates(prev.state, incomingState);
      let nextUpdated = prev.updatedAt;
      if (updatedAt && prev.updatedAt) {
        nextUpdated = new Date(updatedAt) > new Date(prev.updatedAt) ? updatedAt : prev.updatedAt;
      } else {
        nextUpdated = updatedAt ?? prev.updatedAt;
      }
      next[userId] = { ...prev, state: merged, updatedAt: nextUpdated };
    }
  }
  return next;
}

function ensurePresenceRuntime(userId: string) {
  if (presenceCleanup && runtimeUserId === userId) return;
  presenceCleanup?.();
  const sb = getSupabaseClient();
  if (!sb) return;
  runtimeUserId = userId;
  lastActivityMs = Date.now();
  lastActivityThrottleAt = 0;
  channelSubscribed = false;
  lastPresenceHttpPostAt = 0;
  lastPresenceHttpPostVisibility = null;
  const store = useMessengerPresenceStore;
  let activeChannel: RealtimeChannel | null = null;

  const syncOwnState = async () => {
    /** HTTP 하트비트는 채널과 독립 — Realtime 이 끊겨도 DB ping·background 신호 유지 */
    postPresenceHeartbeatHttp();
    if (!channelSubscribed || !activeChannel) return;
    const state = deriveLivePresenceFromSignals({
      nowMs: Date.now(),
      channelSubscribed,
      documentVisible: currentDocumentVisible(),
      lastActivityMs,
    });
    try {
      await activeChannel.track({
        userId,
        state,
        updatedAt: nowIso(),
        lastActivityAt: new Date(lastActivityMs).toISOString(),
      });
    } catch (err) {
      cmRtPresenceIsolatedError("track_failed", {
        userIdTail: userId.length > 8 ? userId.slice(-8) : userId,
        state,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  /** 마지막 HTTP POST 기준 HEARTBEAT_MS 주기 — off-cadence 전송이 있어도 간격이 12s 를 넘지 않게 앵커링 */
  const scheduleHeartbeat = () => {
    clearPresenceHeartbeatTimer();
    if (!currentDocumentVisible()) return;
    const sinceLastPost = lastPresenceHttpPostAt > 0 ? Date.now() - lastPresenceHttpPostAt : 0;
    const delayMs = Math.min(HEARTBEAT_MS, Math.max(0, HEARTBEAT_MS - sinceLastPost));
    presenceHeartbeatTimer = setTimeout(() => {
      presenceHeartbeatTimer = null;
      if (!currentDocumentVisible()) return;
      void syncOwnState().finally(() => {
        scheduleHeartbeat();
      });
    }, delayMs);
  };

  const onSync = () => {
    if (!activeChannel) return;
    const aggregated = aggregatePresenceState(activeChannel.presenceState());
    const previous = store.getState().byUserId;
    const next = { ...previous };
    for (const [id, entry] of Object.entries(aggregated)) {
      next[id] = {
        userId: id,
        state: entry.state,
        lastSeenAt: previous[id]?.lastSeenAt ?? null,
        updatedAt: entry.updatedAt,
      };
    }
    for (const [id, prev] of Object.entries(previous)) {
      if (aggregated[id]) continue;
      next[id] = {
        ...prev,
        state: "offline",
        lastSeenAt: prev.lastSeenAt ?? prev.updatedAt ?? nowIso(),
      };
    }
    store.getState().replacePresenceMap(next);
  };

  let markRealtimeSignal = () => {};
  const sub = subscribeWithRetry({
    sb,
    name: "community-messenger:presence",
    scope: PRESENCE_RUNTIME_SCOPE,
    channelOptions: messengerPrivateBroadcastChannelOptions(),
    isCancelled: () => runtimeRefCount <= 0,
    silentAfterMs: 18_000,
    onStatus: (status) => {
      channelSubscribed = status === "SUBSCRIBED";
      if (channelSubscribed) {
        // 즉시 track — HTTP 는 최소 간격 안이면 생략되어 이중 전송 없음
        void syncOwnState();
      }
      // 채널 상태와 무관하게 HTTP 하트비트 주기 유지 (끊김 시 타이머를 멈추지 않는다)
      scheduleHeartbeat();
    },
    build: (channel) => {
      /**
       * subscribeWithRetry가 내부적으로 채널을 재생성할 때
       * 새 채널은 아직 join 이전 상태이므로 즉시 track/untrack를 막는다.
       */
      channelSubscribed = false;
      activeChannel = channel;
      return channel.on("presence", { event: "sync" }, () => {
        markRealtimeSignal();
        onSync();
      });
    },
  });
  markRealtimeSignal = sub.markSignal;

  const onVisibility = () => {
    if (currentDocumentVisible()) {
      lastActivityMs = Date.now();
      void syncOwnState();
      scheduleHeartbeat();
    } else {
      clearPresenceHeartbeatTimer();
      void syncOwnState();
    }
  };
  const onPageHide = () => {
    const lastSeenAt = nowIso();
    store.getState().upsertPresence(userId, { state: "offline", lastSeenAt, updatedAt: lastSeenAt });
    persistLastSeenSessionEnd(lastSeenAt);
    if (channelSubscribed && activeChannel) {
      void activeChannel.untrack().catch((err) => {
        cmRtPresenceIsolatedError("untrack_failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }
  };

  const onActivity = () => maybeRecordThrottledActivity();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onVisibility);
  window.addEventListener("online", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("pointerdown", onActivity, { capture: true, passive: true });
  document.addEventListener("keydown", onActivity);
  window.addEventListener("scroll", onActivity, { passive: true });

  /** 첫 HTTP 하트비트 — Realtime SUBSCRIBED 를 기다리지 않는다 */
  void syncOwnState();
  scheduleHeartbeat();

  presenceCleanup = () => {
    channelSubscribed = false;
    clearPresenceHeartbeatTimer();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onVisibility);
    window.removeEventListener("online", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("pointerdown", onActivity, true);
    document.removeEventListener("keydown", onActivity);
    window.removeEventListener("scroll", onActivity);
    if (channelSubscribed && activeChannel) {
      void activeChannel.untrack().catch((err) => {
        cmRtPresenceIsolatedError("untrack_failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }
    sub.stop();
    activeChannel = null;
  };
}

function releasePresenceRuntime() {
  if (runtimeRefCount > 0) return;
  presenceCleanup?.();
  presenceCleanup = null;
  runtimeUserId = "";
  channelSubscribed = false;
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

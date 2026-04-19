"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";
import { deriveLivePresenceFromSignals, mergePresenceStates } from "@/lib/community-messenger/presence/presence-policy";
import { recordRouteEntryElapsedMetric, recordRouteEntryMetric } from "@/lib/runtime/samarket-runtime-debug";

type PresencePayload = {
  userId?: unknown;
  state?: unknown;
  updatedAt?: unknown;
};

const HEARTBEAT_MS = 12_000;
const ACTIVITY_THROTTLE_MS = 20_000;

let runtimeRefCount = 0;
let runtimeUserId = "";
let runtimeSessionId = "";
let presenceHeartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let presenceCleanup: (() => void) | null = null;
let lastActivityMs = Date.now();
let lastActivityThrottleAt = 0;
let channelSubscribed = false;

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
    }).catch(() => {});
  }
}

function postPresenceHeartbeatHttp() {
  void fetch("/api/community-messenger/presence", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lastPingAt: nowIso(),
      lastActivityAt: new Date(lastActivityMs).toISOString(),
      appVisibility: currentDocumentVisible() ? "foreground" : "background",
    }),
  }).catch(() => {});
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

function sessionKey(userId: string) {
  return `${userId}:${runtimeSessionId}`;
}

function ensurePresenceRuntime(userId: string) {
  if (presenceCleanup && runtimeUserId === userId) return;
  presenceCleanup?.();
  const sb = getSupabaseClient();
  if (!sb) return;
  runtimeUserId = userId;
  runtimeSessionId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}`;
  lastActivityMs = Date.now();
  lastActivityThrottleAt = 0;
  channelSubscribed = false;
  const store = useMessengerPresenceStore;
  const channel = sb.channel("community-messenger:presence", {
    config: { presence: { key: sessionKey(userId) } },
  });

  const syncOwnState = async () => {
    if (!channelSubscribed) return;
    const state = deriveLivePresenceFromSignals({
      nowMs: Date.now(),
      channelSubscribed,
      documentVisible: currentDocumentVisible(),
      lastActivityMs,
    });
    await channel.track({
      userId,
      state,
      updatedAt: nowIso(),
      lastActivityAt: new Date(lastActivityMs).toISOString(),
    });
    postPresenceHeartbeatHttp();
  };

  const scheduleHeartbeat = () => {
    clearPresenceHeartbeatTimer();
    if (!currentDocumentVisible()) return;
    presenceHeartbeatTimer = setTimeout(() => {
      presenceHeartbeatTimer = null;
      if (!currentDocumentVisible()) return;
      void syncOwnState().finally(() => {
        scheduleHeartbeat();
      });
    }, HEARTBEAT_MS);
  };

  const onSync = () => {
    const aggregated = aggregatePresenceState(channel.presenceState());
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

  channel
    .on("presence", { event: "sync" }, onSync)
    .subscribe((status) => {
      channelSubscribed = status === "SUBSCRIBED";
      if (status === "SUBSCRIBED") {
        void syncOwnState();
        scheduleHeartbeat();
      }
    });

  const onVisibility = () => {
    if (currentDocumentVisible()) {
      lastActivityMs = Date.now();
      scheduleHeartbeat();
    } else {
      clearPresenceHeartbeatTimer();
    }
    void syncOwnState();
  };
  const onPageHide = () => {
    const lastSeenAt = nowIso();
    store.getState().upsertPresence(userId, { state: "offline", lastSeenAt, updatedAt: lastSeenAt });
    persistLastSeenSessionEnd(lastSeenAt);
    void channel.untrack();
  };

  const onActivity = () => maybeRecordThrottledActivity();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onVisibility);
  window.addEventListener("online", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("pointerdown", onActivity, { capture: true, passive: true });
  document.addEventListener("keydown", onActivity);
  window.addEventListener("scroll", onActivity, { passive: true });

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
    void channel.untrack();
    void sb.removeChannel(channel);
  };
}

function releasePresenceRuntime() {
  if (runtimeRefCount > 0) return;
  presenceCleanup?.();
  presenceCleanup = null;
  runtimeUserId = "";
  runtimeSessionId = "";
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

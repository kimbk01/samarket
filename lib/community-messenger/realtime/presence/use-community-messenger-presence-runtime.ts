"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";
import { deriveLivePresenceFromSignals, mergePresenceStates } from "@/lib/community-messenger/presence/presence-policy";
import {
  pausePresenceHeartbeatOnHidden,
  resumePresenceHeartbeatOnVisible,
  sendPresenceHeartbeat,
  sendPresenceSessionEnd,
  startPresenceHeartbeatLoop,
  stopPresenceHeartbeatLoop,
} from "@/lib/community-messenger/presence/presence-heartbeat-controller";
import { recordRouteEntryElapsedMetric, recordRouteEntryMetric } from "@/lib/runtime/samarket-runtime-debug";
import { noteTradeChatRoomPresenceReadyForShellBreakdown } from "@/lib/trade/trade-chat-room-shell-breakdown-perf";
import { cmRtPresenceIsolatedError } from "@/lib/community-messenger/realtime/cm-rt-loop-guard";

type PresencePayload = {
  userId?: unknown;
  state?: unknown;
  updatedAt?: unknown;
};

const ACTIVITY_THROTTLE_MS = 20_000;

let runtimeRefCount = 0;
let runtimeUserId = "";
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

function currentSignals() {
  return {
    documentVisible: currentDocumentVisible(),
    channelSubscribed,
    lastActivityMs,
  };
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
  const store = useMessengerPresenceStore;
  let activeChannel: RealtimeChannel | null = null;

  const syncOwnState = async () => {
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
    void sendPresenceHeartbeat({ signals: currentSignals() });
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
    isCancelled: () => runtimeRefCount <= 0,
    silentAfterMs: 18_000,
    onStatus: (status) => {
      channelSubscribed = status === "SUBSCRIBED";
      if (channelSubscribed) {
        void syncOwnState();
        startPresenceHeartbeatLoop(currentSignals);
      } else {
        stopPresenceHeartbeatLoop();
      }
    },
    build: (channel) => {
      channelSubscribed = false;
      stopPresenceHeartbeatLoop();
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
      resumePresenceHeartbeatOnVisible(currentSignals);
    } else {
      pausePresenceHeartbeatOnHidden();
      void sendPresenceHeartbeat({
        force: true,
        signals: currentSignals(),
        overrides: { status: "away", surface: "background" },
      });
    }
    void syncOwnState();
  };
  const onPageHide = () => {
    const lastSeenAt = nowIso();
    store.getState().upsertPresence(userId, { state: "offline", lastSeenAt, updatedAt: lastSeenAt });
    sendPresenceSessionEnd(lastSeenAt);
    stopPresenceHeartbeatLoop();
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

  presenceCleanup = () => {
    channelSubscribed = false;
    stopPresenceHeartbeatLoop();
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
  stopPresenceHeartbeatLoop();
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

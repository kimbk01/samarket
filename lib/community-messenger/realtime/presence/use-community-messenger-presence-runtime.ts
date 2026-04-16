"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";

type PresencePayload = {
  userId?: unknown;
  state?: unknown;
  updatedAt?: unknown;
};

let runtimeRefCount = 0;
let runtimeUserId = "";
let runtimeSessionId = "";
let presenceHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let presenceCleanup: (() => void) | null = null;

function nowIso() {
  return new Date().toISOString();
}

function currentPresenceState(): CommunityMessengerPresenceState {
  if (typeof document === "undefined") return "online";
  return document.visibilityState === "visible" ? "online" : "away";
}

function sessionKey(userId: string) {
  return `${userId}:${runtimeSessionId}`;
}

function persistLastSeenBestEffort(lastSeenAt: string) {
  if (typeof navigator === "undefined") return;
  const body = JSON.stringify({ lastSeenAt });
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
      const incomingState =
        payload.state === "online" || payload.state === "away" || payload.state === "offline"
          ? payload.state
          : "online";
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
      if (prev.state === "online") continue;
      if (prev.state === "away" && incomingState === "offline") continue;
      next[userId] = { ...prev, state: incomingState, updatedAt: updatedAt ?? prev.updatedAt };
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
  runtimeSessionId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}`;
  const store = useMessengerPresenceStore;
  const channel = sb.channel("community-messenger:presence", {
    config: { presence: { key: sessionKey(userId) } },
  });

  const syncOwnState = async () => {
    await channel.track({
      userId,
      state: currentPresenceState(),
      updatedAt: nowIso(),
    });
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

  channel.on("presence", { event: "sync" }, onSync).subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void syncOwnState();
    }
  });

  const onVisibility = () => {
    void syncOwnState();
  };
  const onPageHide = () => {
    const lastSeenAt = nowIso();
    store.getState().upsertPresence(userId, { state: "offline", lastSeenAt, updatedAt: lastSeenAt });
    persistLastSeenBestEffort(lastSeenAt);
    void channel.untrack();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onVisibility);
  window.addEventListener("online", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  presenceHeartbeatTimer = setInterval(() => {
    void syncOwnState();
  }, 25_000);

  presenceCleanup = () => {
    if (presenceHeartbeatTimer != null) {
      clearInterval(presenceHeartbeatTimer);
      presenceHeartbeatTimer = null;
    }
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onVisibility);
    window.removeEventListener("online", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
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
}

export function useCommunityMessengerPresenceRuntime(userId: string | null | undefined): void {
  useEffect(() => {
    const id = typeof userId === "string" ? userId.trim() : "";
    if (!id) return;
    runtimeRefCount += 1;
    ensurePresenceRuntime(id);
    return () => {
      runtimeRefCount = Math.max(0, runtimeRefCount - 1);
      releasePresenceRuntime();
    };
  }, [userId]);
}

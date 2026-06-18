"use client";

import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";

const POLL_MS = 45_000;
const fetchUrl = "/api/me/notifications/badge-count";

let snap: NotificationBadgeCount | null = null;
let subscriberCount = 0;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let unauthorizedPaused = false;

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setSnap(next: NotificationBadgeCount | null) {
  snap = next;
  emit();
}

export function getNotificationBadgeCountSnapshot(): NotificationBadgeCount | null {
  return snap;
}

export function getNotificationBadgeCountServerSnapshot(): NotificationBadgeCount | null {
  return null;
}

export function subscribeNotificationBadgeCount(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  subscriberCount += 1;
  if (subscriberCount === 1) void doFetch();
  return () => {
    listeners.delete(onStoreChange);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };
}

async function doFetch(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch(force ? `${fetchUrl}?fresh=1` : fetchUrl, { credentials: "include" });
    if (res.status === 401) {
      setSnap(null);
      unauthorizedPaused = true;
      return;
    }
    unauthorizedPaused = false;
    const j = await res.json();
    if (j?.ok) {
      const next: NotificationBadgeCount = {
        total: Math.max(0, Math.floor(Number(j.total) || 0)),
        chat: Math.max(0, Math.floor(Number(j.chat) || 0)),
        group: Math.max(0, Math.floor(Number(j.group) || 0)),
        trade: Math.max(0, Math.floor(Number(j.trade) || 0)),
        store: Math.max(0, Math.floor(Number(j.store) || 0)),
        missedCall: Math.max(0, Math.floor(Number(j.missedCall) || 0)),
      };
      setSnap(next);
      logNotifyBadge("ui_set", next);
      if (!pollInterval && subscriberCount > 0) {
        pollInterval = setInterval(() => {
          if (document.visibilityState === "visible") void doFetch();
        }, POLL_MS);
      }
    } else {
      setSnap(null);
    }
  } catch {
    setSnap(null);
  }
}

export function requestNotificationBadgeCountResync(reason?: string): void {
  void doFetch(true);
  if (reason) logNotifyBadge("ui_set", { resync: reason });
}

export function resetNotificationBadgeCountStoreForTests(): void {
  snap = null;
  listeners.clear();
  subscriberCount = 0;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

"use client";

import { useEffect, useRef, useState } from "react";

const CHANNEL_NAME = "samarket:cm-incoming-call-tab-leader";
const LOCK_KEY = "samarket:cm-incoming-call-tab-leader";
const LOCK_STALE_MS = 12_000;
const HEARTBEAT_MS = 4_000;

type LeaderMessage = { type: "heartbeat"; tabId: string; at: number };

function randomTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readLock(): { tabId: string; at: number } | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { tabId?: string; at?: number };
    if (!j.tabId || typeof j.at !== "number") return null;
    return { tabId: j.tabId, at: j.at };
  } catch {
    return null;
  }
}

function writeLock(tabId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(LOCK_KEY, JSON.stringify({ tabId, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

function clearLockIfOwned(tabId: string): void {
  const cur = readLock();
  if (cur?.tabId === tabId) {
    try {
      sessionStorage.removeItem(LOCK_KEY);
    } catch {
      /* ignore */
    }
  }
}

/**
 * 동일 브라우저·계정 다중 탭 — incoming 풀스크린·벨 소리는 leader 탭만 담당.
 */
export function useIncomingCallTabLeader(enabled: boolean): { isLeader: boolean } {
  const tabIdRef = useRef(randomTabId());
  const [isLeader, setIsLeader] = useState(() => {
    if (!enabled || typeof window === "undefined") return true;
    const cur = readLock();
    if (!cur || Date.now() - cur.at > LOCK_STALE_MS) {
      writeLock(tabIdRef.current);
      return true;
    }
    return cur.tabId === tabIdRef.current;
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setIsLeader(true);
      return;
    }

    const tabId = tabIdRef.current;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      setIsLeader(true);
      return;
    }

    const claimIfStale = () => {
      const cur = readLock();
      const stale = !cur || Date.now() - cur.at > LOCK_STALE_MS;
      if (stale || cur?.tabId === tabId) {
        writeLock(tabId);
        setIsLeader(true);
        return true;
      }
      setIsLeader(false);
      return false;
    };

    claimIfStale();

    const onMessage = (ev: MessageEvent<LeaderMessage>) => {
      const data = ev.data;
      if (!data || data.type !== "heartbeat") return;
      if (data.tabId === tabId) return;
      const cur = readLock();
      if (cur?.tabId === tabId && data.at > cur.at) {
        setIsLeader(false);
      }
    };

    channel.addEventListener("message", onMessage);

    const heartbeat = window.setInterval(() => {
      if (!claimIfStale()) return;
      const msg: LeaderMessage = { type: "heartbeat", tabId, at: Date.now() };
      channel?.postMessage(msg);
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeat);
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      clearLockIfOwned(tabId);
    };
  }, [enabled]);

  return { isLeader };
}

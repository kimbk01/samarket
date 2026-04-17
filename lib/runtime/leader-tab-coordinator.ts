"use client";

import { useEffect, useState } from "react";
import { samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";

/**
 * `use-trade-multi-tab-visibility-or` 과 동일 키 — 탭당 하나의 id.
 * 리더 선출은 이 id 의 **사전순 최소값** 탭이 담당(결정적·승계: 해당 탭 닫히면 다음 최소).
 */
const TAB_ID_SESSION_KEY = "samarket:trade-tab-id";

function getOrCreateBrowserTabId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const ex = sessionStorage.getItem(TAB_ID_SESSION_KEY);
    if (ex) return ex;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(TAB_ID_SESSION_KEY, id);
    return id;
  } catch {
    return `t-${Date.now()}`;
  }
}

function channelNameForScope(scope: string): string {
  return `samarket:leader:${scope.replace(/[^a-zA-Z0-9:_-]/g, "")}`;
}

type LeaderMsg =
  | { v: 1; type: "alive"; scope: string; tabId: string; t: number }
  | { v: 1; type: "bye"; scope: string; tabId: string };

const PEER_TTL_MS = 8000;
const ALIVE_INTERVAL_MS = 2500;

/** `subscribeTabLeader` → `samarket:leader:owner-hub-badge` */
export const SAMARKET_OWNER_HUB_BADGE_LEADER_SCOPE = "owner-hub-badge";

/** 리더가 fetch 후 스냅샷 브로드캐스트·비리더가 갱신 요청 */
export const SAMARKET_OWNER_HUB_BADGE_SYNC_CHANNEL = "samarket:owner-hub-badge-sync";

/**
 * 동일 `scope` 를 쓰는 탭들 중 **한 탭만** `isLeader === true`.
 * BroadcastChannel + 주기적 alive; `pagehide` 시 bye 로 승계 유도.
 */
export function subscribeTabLeader(scope: string, onChange: (isLeader: boolean) => void): () => void {
  if (typeof window === "undefined") {
    onChange(true);
    return () => {};
  }

  const myId = getOrCreateBrowserTabId();
  const peers = new Map<string, number>();

  const pruneAndPickLeader = (): boolean => {
    const now = Date.now();
    for (const [id, t] of [...peers.entries()]) {
      if (now - t > PEER_TTL_MS) peers.delete(id);
    }
    if (peers.size === 0) {
      peers.set(myId, now);
    }
    const sorted = [...peers.keys()].sort();
    const leaderId = sorted[0] ?? myId;
    return leaderId === myId;
  };

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(channelNameForScope(scope));
  } catch {
    samarketRuntimeDebugLog("leader-tab", "BroadcastChannel constructor failed; all-tabs leader fallback", {
      scope,
    });
    onChange(true);
    return () => {};
  }

  const post = (msg: LeaderMsg) => {
    try {
      bc?.postMessage(msg);
    } catch {
      /* ignore */
    }
  };

  const broadcastAlive = () => {
    post({ v: 1, type: "alive", scope, tabId: myId, t: Date.now() });
  };

  let lastDebugLeader: boolean | null = null;
  const apply = () => {
    const next = pruneAndPickLeader();
    if (lastDebugLeader !== next) {
      samarketRuntimeDebugLog("leader-tab", "leader flag changed", { scope, isLeader: next });
      lastDebugLeader = next;
    }
    onChange(next);
  };

  const onMsg = (ev: MessageEvent) => {
    const d = ev.data as Partial<LeaderMsg>;
    if (!d || d.v !== 1 || d.scope !== scope || typeof d.tabId !== "string" || !d.tabId) return;
    if (d.type === "alive" && typeof d.t === "number") {
      peers.set(d.tabId, d.t);
    } else if (d.type === "bye") {
      peers.delete(d.tabId);
    }
    apply();
  };

  bc.addEventListener("message", onMsg);
  peers.set(myId, Date.now());
  broadcastAlive();
  apply();

  const aliveTimer = window.setInterval(() => {
    peers.set(myId, Date.now());
    broadcastAlive();
    apply();
  }, ALIVE_INTERVAL_MS);

  const onPageHide = () => {
    post({ v: 1, type: "bye", scope, tabId: myId });
  };
  window.addEventListener("pagehide", onPageHide);

  return () => {
    window.removeEventListener("pagehide", onPageHide);
    window.clearInterval(aliveTimer);
    bc?.removeEventListener("message", onMsg);
    post({ v: 1, type: "bye", scope, tabId: myId });
    peers.delete(myId);
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
  };
}

/** HTTP POST 등 “탭 하나만” 실행할 때 사용 */
export function useSamarketTabLeader(scope: string): boolean {
  const [isLeader, setIsLeader] = useState(false);
  useEffect(() => subscribeTabLeader(scope, setIsLeader), [scope]);
  return isLeader;
}

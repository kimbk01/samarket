"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BC_NAME = "samarket:trade-visibility-or-v1";
const TRADE_TAB_VISIBILITY_STALE_MS = 90_000;
const TRADE_TAB_VISIBILITY_HEARTBEAT_MS = 30_000;

function tabId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const k = "samarket:trade-tab-id";
    const ex = sessionStorage.getItem(k);
    if (ex) return ex;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(k, id);
    return id;
  } catch {
    return `t-${Date.now()}`;
  }
}

/**
 * 여러 탭 중 **하나라도** `visible` 이면 true — 거래 presence 의 `tabVisible` 에 사용.
 */
export function useTradeMultiTabVisibilityOr(enabled: boolean): boolean {
  const [anyVisible, setAnyVisible] = useState(() =>
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );
  const mapRef = useRef<Record<string, number>>({});
  const idRef = useRef<string>("");
  const bcRef = useRef<BroadcastChannel | null>(null);

  const recomputeAnyVisible = useCallback((now = Date.now()) => {
    for (const [tabKey, seenAt] of Object.entries(mapRef.current)) {
      if (now - seenAt > TRADE_TAB_VISIBILITY_STALE_MS) {
        delete mapRef.current[tabKey];
      }
    }
    setAnyVisible(Object.keys(mapRef.current).length > 0);
  }, []);

  const postVisibility = useCallback((tid: string, visible: boolean) => {
    try {
      if (!bcRef.current) {
        bcRef.current = new BroadcastChannel(BC_NAME);
      }
      bcRef.current.postMessage({ tabId: tid, visible, at: Date.now() });
    } catch {
      /* ignore */
    }
  }, []);

  const publish = useCallback((visible: boolean) => {
    if (!enabled || typeof window === "undefined") return;
    const tid = idRef.current || (idRef.current = tabId());
    if (visible) mapRef.current[tid] = Date.now();
    else delete mapRef.current[tid];
    recomputeAnyVisible();
    postVisibility(tid, visible);
  }, [enabled, postVisibility, recomputeAnyVisible]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const tid = idRef.current || (idRef.current = tabId());
    const apply = () => {
      const v = document.visibilityState === "visible";
      if (v) mapRef.current[tid] = Date.now();
      else delete mapRef.current[tid];
      recomputeAnyVisible();
      postVisibility(tid, v);
    };
    const onPageHide = () => publish(false);
    apply();
    try {
      bcRef.current = new BroadcastChannel(BC_NAME);
      bcRef.current.onmessage = (ev: MessageEvent) => {
        const p = ev.data as { tabId?: unknown; visible?: unknown; at?: unknown };
        const ot = typeof p.tabId === "string" ? p.tabId : "";
        const ov = p.visible === true;
        const at = typeof p.at === "number" && Number.isFinite(p.at) ? p.at : Date.now();
        if (!ot) return;
        if (ov) mapRef.current[ot] = at;
        else delete mapRef.current[ot];
        recomputeAnyVisible(at);
      };
    } catch {
      bcRef.current = null;
    }
    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        recomputeAnyVisible();
        return;
      }
      mapRef.current[tid] = Date.now();
      recomputeAnyVisible();
      postVisibility(tid, true);
    }, TRADE_TAB_VISIBILITY_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", apply);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", apply);
      window.removeEventListener("pagehide", onPageHide);
      delete mapRef.current[tid];
      postVisibility(tid, false);
      try {
        if (bcRef.current) {
          bcRef.current.close();
          bcRef.current = null;
        }
      } catch {
        /* ignore */
      }
      recomputeAnyVisible();
    };
  }, [enabled, postVisibility, publish, recomputeAnyVisible]);

  return anyVisible;
}

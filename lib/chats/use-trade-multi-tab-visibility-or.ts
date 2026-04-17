"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BC_NAME = "samarket:trade-visibility-or-v1";

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
  const mapRef = useRef<Record<string, boolean>>({});
  const idRef = useRef<string>("");

  const publish = useCallback((visible: boolean) => {
    if (!enabled || typeof window === "undefined") return;
    const tid = idRef.current || (idRef.current = tabId());
    mapRef.current[tid] = visible;
    setAnyVisible(Object.values(mapRef.current).some(Boolean));
    try {
      const bc = new BroadcastChannel(BC_NAME);
      bc.postMessage({ tabId: tid, visible });
      bc.close();
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const tid = idRef.current || (idRef.current = tabId());
    const apply = () => {
      const v = document.visibilityState === "visible";
      mapRef.current[tid] = v;
      setAnyVisible(Object.values(mapRef.current).some(Boolean));
      try {
        const bc = new BroadcastChannel(BC_NAME);
        bc.postMessage({ tabId: tid, visible: v });
        bc.close();
      } catch {
        /* ignore */
      }
    };
    apply();
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC_NAME);
      bc.onmessage = (ev: MessageEvent) => {
        const p = ev.data as { tabId?: unknown; visible?: unknown };
        const ot = typeof p.tabId === "string" ? p.tabId : "";
        const ov = p.visible === true;
        if (!ot) return;
        mapRef.current[ot] = ov;
        setAnyVisible(Object.values(mapRef.current).some(Boolean));
      };
    } catch {
      bc = null;
    }
    document.addEventListener("visibilitychange", apply);
    return () => {
      document.removeEventListener("visibilitychange", apply);
      mapRef.current[tid] = false;
      try {
        const x = new BroadcastChannel(BC_NAME);
        x.postMessage({ tabId: tid, visible: false });
        x.close();
      } catch {
        /* ignore */
      }
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
      setAnyVisible(Object.values(mapRef.current).some(Boolean));
    };
  }, [enabled]);

  return anyVisible;
}

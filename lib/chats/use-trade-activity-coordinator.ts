"use client";

import { useCallback, useEffect, useRef } from "react";

const BC_NAME = "samarket:trade-activity-v1";

/**
 * 거래 채팅 presence 용 **앱(탭) 전역** 활동 시각 — 한 탭이라도 포그라운드+활동이면 최신 시각 유지.
 */
export function useTradeActivityCoordinator(enabled: boolean) {
  const lastMsRef = useRef(0);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const bump = useCallback(() => {
    if (!enabled) return;
    const t = Date.now();
    if (t <= lastMsRef.current) return;
    lastMsRef.current = t;
    try {
      bcRef.current?.postMessage({ t });
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    lastMsRef.current = Date.now();
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC_NAME);
      bcRef.current = bc;
      bc.onmessage = (ev: MessageEvent) => {
        const t = Number((ev.data as { t?: unknown })?.t);
        if (Number.isFinite(t) && t > lastMsRef.current) lastMsRef.current = t;
      };
    } catch {
      bcRef.current = null;
    }

    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    const onPointer = () => bump();
    const onKey = () => bump();
    const onScroll = () => bump();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
      bcRef.current = null;
    };
  }, [enabled, bump]);

  const getLastActivityAtMs = useCallback(() => lastMsRef.current, []);

  const isTabVisible = useCallback(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState === "visible";
  }, []);

  return { bump, getLastActivityAtMs, isTabVisible };
}

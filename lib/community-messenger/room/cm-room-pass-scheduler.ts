"use client";

import { scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";

/** PASS0 shell paint → PASS1 (header+composer) on next frame. */
export function scheduleCmRoomPass0ToPass1(run: () => void): () => void {
  if (typeof window === "undefined") {
    run();
    return () => undefined;
  }
  const raf = window.requestAnimationFrame(() => run());
  return () => window.cancelAnimationFrame(raf);
}

/** PASS1 chrome commit → PASS2 viewport on next frame. */
export function scheduleCmRoomPass1ToPass2(run: () => void): () => void {
  return scheduleCmRoomPass0ToPass1(run);
}

/** PASS2 visible rows painted → idle hydrate remaining virtual rows. */
export function scheduleCmRoomPass2IdleExpand(run: () => void, timeoutMs = 400): () => void {
  if (typeof window === "undefined") {
    run();
    return () => undefined;
  }
  let cancelled = false;
  let idleId = -1;
  const raf = window.requestAnimationFrame(() => {
    if (cancelled) return;
    const scheduling = globalThis as typeof globalThis & {
      scheduler?: { postTask?: (cb: () => void, opts?: { priority?: string }) => void };
    };
    if (scheduling.scheduler?.postTask) {
      scheduling.scheduler.postTask(() => {
        if (!cancelled) run();
      }, { priority: "background" });
      return;
    }
    idleId = scheduleWhenBrowserIdle(() => {
      if (!cancelled) run();
    }, timeoutMs);
  });
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf);
    if (idleId >= 0) {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    }
  };
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Viewport measurement only.
 *
 * Listens to resize / orientationchange / visualViewport and coalesces via rAF.
 * Device identity is FD1 DeviceClass. App shell identity is FD4 resolveAppShell.
 * This hook must not classify Phone / Tablet / Desktop.
 *
 * Messenger room keyboard/scroll must not use this — `use-cm-room-kb-offset`.
 */

export type AppViewportSize = {
  /** layout viewport width (px) */
  width: number;
  /** layout viewport height (px) — 보통 `window.innerHeight` */
  height: number;
  /** visualViewport.height — 키보드/주소창 변동 반영 (지원 안 하면 layout height 와 동일) */
  visualHeight: number;
};

const SSR_FALLBACK: AppViewportSize = {
  width: 360,
  height: 720,
  visualHeight: 720,
};

function readCurrentSize(): AppViewportSize {
  if (typeof window === "undefined") return SSR_FALLBACK;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const vv = window.visualViewport;
  return {
    width: w,
    height: h,
    visualHeight: vv?.height ?? h,
  };
}

function viewportSizesEqual(a: AppViewportSize, b: AppViewportSize): boolean {
  return a.width === b.width && a.height === b.height && a.visualHeight === b.visualHeight;
}

export function useAppViewportSize(): AppViewportSize {
  const [size, setSize] = useState<AppViewportSize>(() => readCurrentSize());
  const prevRef = useRef<AppViewportSize>(size);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let rafId = 0;
    const sync = () => {
      rafId = 0;
      const next = readCurrentSize();
      if (viewportSizesEqual(prevRef.current, next)) return;
      prevRef.current = next;
      setSize(next);
    };
    const schedule = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(sync);
    };

    schedule();

    const vv = window.visualViewport ?? null;
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
    };
  }, []);

  return size;
}

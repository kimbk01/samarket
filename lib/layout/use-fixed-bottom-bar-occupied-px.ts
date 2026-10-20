"use client";

import { useEffect, useState } from "react";
import {
  FIXED_BOTTOM_BAR_MARKER_CLASS,
  measureFixedBottomBarOccupiedPx,
} from "@/lib/layout/fixed-bottom-bar-occupancy";

type RectLike = { top: number; height: number };

function readMarkerRects(): RectLike[] {
  if (typeof document === "undefined") return [];
  const nodes = document.getElementsByClassName(FIXED_BOTTOM_BAR_MARKER_CLASS);
  const out: RectLike[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const r = nodes[i]!.getBoundingClientRect();
    out.push({ top: r.top, height: r.height });
  }
  return out;
}

/**
 * 표식 고정 바들의 점유 높이 구독 — 바 마운트/해제(DOM 변경), 바 크기 변화, 뷰포트·키보드 변화에 갱신.
 * `enabled=false` 이면 관찰하지 않고 0.
 */
export function useFixedBottomBarOccupiedPx(enabled: boolean): number {
  const [occupied, setOccupied] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") {
      setOccupied(0);
      return;
    }
    let raf = 0;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => schedule()) : null;
    const observed = new Set<Element>();

    const measure = () => {
      raf = 0;
      const nodes = document.getElementsByClassName(FIXED_BOTTOM_BAR_MARKER_CLASS);
      if (ro) {
        const live = new Set<Element>();
        for (let i = 0; i < nodes.length; i += 1) live.add(nodes[i]!);
        for (const el of observed) {
          if (!live.has(el)) {
            ro.unobserve(el);
            observed.delete(el);
          }
        }
        for (const el of live) {
          if (!observed.has(el)) {
            ro.observe(el);
            observed.add(el);
          }
        }
      }
      /** FAB 와 고정 바 모두 같은 레이아웃 뷰포트 하단 기준 `position: fixed` */
      const next = measureFixedBottomBarOccupiedPx(readMarkerRects(), window.innerHeight);
      setOccupied((prev) => (prev === next ? prev : next));
    };

    function schedule() {
      if (raf) return;
      raf = window.requestAnimationFrame(measure);
    }

    measure();
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(schedule) : null;
    mo?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      mo?.disconnect();
      ro?.disconnect();
      observed.clear();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [enabled]);

  return enabled ? occupied : 0;
}

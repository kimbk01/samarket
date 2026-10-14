"use client";

import { useEffect, useRef, useState } from "react";
import { resolveAppShellScrollTopY } from "@/lib/layout/resolve-app-shell-scroll-top";
import { subscribeAppOrOwnerShellScroll } from "@/lib/layout/subscribe-app-or-owner-shell-scroll";
import {
  DIBAY_PTR_ERROR_HOLD_MS,
  DIBAY_PTR_SUCCESS_HOLD_MS,
  DIBAY_PTR_VERTICAL_RATIO,
  type DibayPtrHandlerResult,
} from "@/lib/ui/ptr/dibay-ptr-ssot";

const DEFAULT_THRESHOLD_PX = 52;

export type DocumentTopPtrResult = "success" | "error" | null;

/**
 * 문서가 맨 위일 때 세로로 아래로 당기면 `onRefresh` 실행 (모바일 웹 P2R).
 * `touchmove` 는 당김이 감지된 뒤에만 `passive: false` 로 등록한다.
 */
export function usePullToRefreshAtDocumentTop(
  onRefresh: () => Promise<DibayPtrHandlerResult>,
  options?: { enabled?: boolean; thresholdPx?: number }
) {
  const enabled = options?.enabled !== false;
  const threshold = options?.thresholdPx ?? DEFAULT_THRESHOLD_PX;
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /** 새로고침 결과 — SUCCESS/ERROR 유지 시간 동안만 값 (`dibay-ptr-ssot`) */
  const [result, setResult] = useState<DocumentTopPtrResult>(null);
  const resultTimerRef = useRef<number | null>(null);
  const pullRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  /** 세로 당김으로 판정된 뒤에만 preventDefault — 가로 스크롤 보존 (D17) */
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const moveHandlerRef = useRef<((e: TouchEvent) => void) | null>(null);

  const removeMove = () => {
    const h = moveHandlerRef.current;
    if (h) {
      window.removeEventListener("touchmove", h);
      moveHandlerRef.current = null;
    }
  };

  useEffect(() => {
    if (!enabled) return;

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      removeMove();
      if (resolveAppShellScrollTopY() > 2) return;
      startYRef.current = e.touches[0]?.clientY ?? null;
      startXRef.current = e.touches[0]?.clientX ?? null;
      pullingRef.current = false;
      if (startYRef.current == null) return;

      const onMove = (ev: TouchEvent) => {
        if (resolveAppShellScrollTopY() > 2) {
          removeMove();
          pullRef.current = 0;
          setPullPx(0);
          return;
        }
        const y0 = startYRef.current;
        if (y0 == null) return;
        const y = ev.touches[0]?.clientY;
        if (y == null) return;
        const dy = y - y0;
        const dx = (ev.touches[0]?.clientX ?? 0) - (startXRef.current ?? 0);
        if (!pullingRef.current) {
          if (dy > 8 && dy >= Math.abs(dx) * DIBAY_PTR_VERTICAL_RATIO) {
            pullingRef.current = true;
          } else if (Math.abs(dx) > 8 && Math.abs(dx) > dy) {
            // 가로 제스처 — PTR 추적 중단, 기본 스크롤 유지
            removeMove();
            return;
          }
        }
        if (pullingRef.current && dy > 8) {
          try {
            ev.preventDefault();
          } catch {
            /* noop */
          }
        }
        if (dy > 0 && pullingRef.current) {
          const damped = Math.min(dy * 0.42, 100);
          pullRef.current = damped;
          setPullPx(damped);
        } else {
          pullRef.current = 0;
          setPullPx(0);
        }
      };

      moveHandlerRef.current = onMove;
      window.addEventListener("touchmove", onMove, { passive: false });
    };

    const runRefresh = () => {
      if (refreshingRef.current) {
        setPullPx(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setResult(null);
      setPullPx(0);
      pullRef.current = 0;
      void (async () => {
        let outcome: DocumentTopPtrResult = null;
        try {
          const r = await onRefreshRef.current();
          outcome = r === "error" ? "error" : r === "cancelled" ? null : "success";
        } catch {
          outcome = "error";
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
        }
        if (outcome == null) return;
        setResult(outcome);
        if (resultTimerRef.current != null) window.clearTimeout(resultTimerRef.current);
        resultTimerRef.current = window.setTimeout(
          () => {
            resultTimerRef.current = null;
            setResult(null);
          },
          outcome === "success" ? DIBAY_PTR_SUCCESS_HOLD_MS : DIBAY_PTR_ERROR_HOLD_MS
        );
      })();
    };

    const onEnd = () => {
      removeMove();
      startYRef.current = null;
      const p = pullRef.current;
      pullRef.current = 0;
      if (p >= threshold) {
        runRefresh();
      }
      setPullPx(0);
    };

    const unsubScroll = subscribeAppOrOwnerShellScroll(() => {
      if (resolveAppShellScrollTopY() > 2) {
        removeMove();
        pullRef.current = 0;
        setPullPx(0);
      }
    });

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);

    return () => {
      unsubScroll();
      removeMove();
      if (resultTimerRef.current != null) {
        window.clearTimeout(resultTimerRef.current);
        resultTimerRef.current = null;
      }
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, threshold]);

  return {
    pullPx,
    refreshing,
    result,
    /** 임계값 이상이면 놓을 때 새로고침 */
    willReleaseRefresh: pullPx >= threshold,
  };
}
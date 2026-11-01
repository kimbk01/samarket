"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * 화면 왼쪽 가장자리 스와이프 뒤로 — 장바구니(`StoreCartSwipeBackShell`)·메신저 방과 같은 웹 방식·같은 수치.
 * 왼쪽 띠에서 시작해 가로로 잡히면 화면이 손가락을 따라오고, 놓을 때 기준 이상이면 `onCommit`.
 * 화면은 항상 제자리로 돌아온다 — 닫을지·물을지는 `onCommit` 쪽(뒤로가기 처리)이 정한다.
 * iOS WKWebView 내장 스와이프(allowsBackForwardNavigationGestures)는 같은 문서 기록(pushState)에서 시작되지 않아
 * 쓰지 않는다(2026-11-02 iPhone build 21 실기 FAIL).
 */
export const EDGE_SWIPE_BACK_EDGE_PX = 18;
export const EDGE_SWIPE_BACK_LOCK_PX = 10;
export const EDGE_SWIPE_BACK_THRESHOLD_RATIO = 0.3;
export const EDGE_SWIPE_BACK_MIN_COMMIT_PX = 56;
const SETTLE_MS = 220;
const SETTLE_EASING = "cubic-bezier(0.33, 0.9, 0.22, 1)";

export function edgeSwipeBackCommitPx(width: number): number {
  return Math.max(EDGE_SWIPE_BACK_MIN_COMMIT_PX, width * EDGE_SWIPE_BACK_THRESHOLD_RATIO);
}

/** 이동량으로 판단: 아직 모름 / 세로(취소) / 가로(스와이프) */
export function resolveEdgeSwipeAxis(dx: number, dy: number): "undecided" | "vertical" | "horizontal" {
  if (Math.abs(dx) < EDGE_SWIPE_BACK_LOCK_PX && Math.abs(dy) < EDGE_SWIPE_BACK_LOCK_PX) return "undecided";
  return Math.abs(dy) >= Math.abs(dx) ? "vertical" : "horizontal";
}

type Phase = "idle" | "dragging" | "settling";

export type EdgeSwipeBackEdgeProps = {
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

export function useEdgeSwipeBack(opts: { enabled: boolean; onCommit: () => void }): {
  /** 왼쪽 띠(`EDGE_SWIPE_BACK_EDGE_PX` 폭, `touch-none`)에 붙인다 · 꺼져 있으면 null(띠를 그리지 않음) */
  edgeProps: EdgeSwipeBackEdgeProps | null;
  /** 손가락을 따라 움직일 화면에 붙인다 */
  surfaceStyle: CSSProperties | undefined;
} {
  const reducedMotion = usePrefersReducedMotion();
  const onCommitRef = useRef(opts.onCommit);
  useEffect(() => {
    onCommitRef.current = opts.onCommit;
  });
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragPx, setDragPx] = useState(0);
  const dragPxRef = useRef(0);
  const gestureRef = useRef<{ pointerId: number; startX: number; startY: number; horizontal: boolean } | null>(null);

  useEffect(() => {
    if (phase !== "settling") return;
    const t = window.setTimeout(() => setPhase((p) => (p === "settling" ? "idle" : p)), SETTLE_MS + 40);
    return () => window.clearTimeout(t);
  }, [phase]);

  const setDrag = useCallback((px: number) => {
    dragPxRef.current = px;
    setDragPx(px);
  }, []);

  const release = useCallback((el: HTMLDivElement, pointerId: number) => {
    try {
      el.releasePointerCapture(pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.clientX > EDGE_SWIPE_BACK_EDGE_PX) return;
    gestureRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, horizontal: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      const dx = e.clientX - g.startX;
      if (!g.horizontal) {
        const axis = resolveEdgeSwipeAxis(dx, e.clientY - g.startY);
        if (axis === "undecided") return;
        if (axis === "vertical") {
          gestureRef.current = null;
          release(e.currentTarget, e.pointerId);
          return;
        }
        g.horizontal = true;
        setPhase("dragging");
      }
      if (!reducedMotion) setDrag(Math.max(0, Math.min(dx, window.innerWidth)));
      else dragPxRef.current = Math.max(0, dx);
    },
    [reducedMotion, release, setDrag]
  );

  const finish = useCallback(
    (commit: boolean) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g?.horizontal) return;
      const x = dragPxRef.current;
      setDrag(0);
      setPhase("settling");
      if (commit && x >= edgeSwipeBackCommitPx(window.innerWidth)) onCommitRef.current();
    },
    [setDrag]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (gestureRef.current?.pointerId !== e.pointerId) return;
      release(e.currentTarget, e.pointerId);
      finish(true);
    },
    [finish, release]
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (gestureRef.current?.pointerId !== e.pointerId) return;
      finish(false);
    },
    [finish]
  );

  if (!opts.enabled) return { edgeProps: null, surfaceStyle: undefined };
  const surfaceStyle: CSSProperties | undefined =
    phase === "dragging"
      ? { transform: `translate3d(${dragPx}px,0,0)`, transition: "none", willChange: "transform" }
      : phase === "settling"
        ? { transform: "translate3d(0,0,0)", transition: `transform ${SETTLE_MS}ms ${SETTLE_EASING}` }
        : undefined;
  return { edgeProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }, surfaceStyle };
}

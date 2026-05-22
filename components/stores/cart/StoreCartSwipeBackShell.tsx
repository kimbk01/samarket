"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  STORE_DETAIL_SLIDE_EXIT_EASING,
  STORE_DETAIL_SLIDE_MS,
} from "@/lib/dibay/store-detail-page-slide";
import { runStoreCartBackNavigation } from "@/lib/stores/store-cart-back-navigation";

const EDGE_HIT_PX = 18;
const HORIZONTAL_LOCK_PX = 10;
const THRESHOLD_RATIO = 0.3;
const MIN_COMMIT_PX = 56;

type AnimPhase = "idle" | "dragging" | "snap-back" | "snap-away" | "exit-active";

const StoreCartAnimatedBackContext = createContext<(() => void) | null>(null);

/** 헤더 뒤로 — 스와이프 셸과 동일 애니메이션·네비 규칙 */
export function useStoreCartAnimatedBack(): (() => void) | null {
  return useContext(StoreCartAnimatedBackContext);
}

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

/**
 * `/stores/[slug]/cart` — 왼쪽 가장자리에서 오른쪽 스와이프 시 **이전 페이지(history back)**.
 * 헤더 뒤로와 동일한 `runStoreCartBackNavigation`.
 */
export function StoreCartSwipeBackShell({
  storeSlug,
  children,
}: {
  storeSlug: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const slug = storeSlug.trim();

  const [phase, setPhase] = useState<AnimPhase>("idle");
  const [dragPx, setDragPx] = useState(0);
  const dragPxRef = useRef(0);
  useEffect(() => {
    dragPxRef.current = dragPx;
  }, [dragPx]);

  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    armed: boolean;
    horizontal: boolean;
  } | null>(null);
  const pendingNavRef = useRef(false);
  const committedNavRef = useRef(false);

  const widthRef = useRef(typeof window !== "undefined" ? window.innerWidth : 400);
  useEffect(() => {
    const onResize = () => {
      widthRef.current = window.innerWidth;
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const commitNavigation = useCallback(() => {
    if (committedNavRef.current) return;
    committedNavRef.current = true;
    runStoreCartBackNavigation(router, slug);
  }, [router, slug]);

  const requestAnimatedBack = useCallback(() => {
    if (committedNavRef.current || pendingNavRef.current) return;
    if (reducedMotion) {
      commitNavigation();
      return;
    }
    pendingNavRef.current = true;
    setPhase("exit-active");
    setDragPx(0);
  }, [commitNavigation, reducedMotion]);

  const onEdgePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      if (e.button !== 0) return;
      if (typeof window === "undefined") return;
      if (e.clientX > EDGE_HIT_PX) return;
      gestureRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        armed: true,
        horizontal: false,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [reducedMotion]
  );

  const onEdgePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId || !g.armed) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.horizontal) {
      if (Math.abs(dx) < HORIZONTAL_LOCK_PX && Math.abs(dy) < HORIZONTAL_LOCK_PX) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        g.armed = false;
        gestureRef.current = null;
        setPhase("idle");
        setDragPx(0);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
        return;
      }
      g.horizontal = true;
      setPhase("dragging");
    }
    if (!g.horizontal) return;
    const w = widthRef.current || window.innerWidth;
    const next = Math.max(0, Math.min(dx, w));
    setDragPx(next);
  }, []);

  const finishGesture = useCallback(() => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g?.horizontal) {
      setPhase("idle");
      setDragPx(0);
      return;
    }
    const w = widthRef.current || (typeof window !== "undefined" ? window.innerWidth : 400);
    const x = dragPxRef.current;
    const threshold = Math.max(MIN_COMMIT_PX, w * THRESHOLD_RATIO);
    if (x >= threshold) {
      pendingNavRef.current = true;
      setPhase("snap-away");
      setDragPx(w);
    } else {
      setPhase("snap-back");
      setDragPx(0);
    }
  }, []);

  const onEdgePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      finishGesture();
    },
    [finishGesture]
  );

  const onEdgePointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    setPhase("snap-back");
    setDragPx(0);
  }, []);

  const onSurfaceTransitionEnd = useCallback(
    (e: ReactTransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "transform") return;
      if ((phase === "snap-away" || phase === "exit-active") && pendingNavRef.current) {
        pendingNavRef.current = false;
        commitNavigation();
        setPhase("idle");
        setDragPx(0);
        return;
      }
      if (phase === "snap-back") {
        setPhase("idle");
      }
    },
    [phase, commitNavigation]
  );

  useEffect(() => {
    if ((phase !== "snap-away" && phase !== "exit-active") || !pendingNavRef.current) return;
    const t = window.setTimeout(() => {
      if (!pendingNavRef.current) return;
      pendingNavRef.current = false;
      commitNavigation();
      setPhase("idle");
      setDragPx(0);
    }, STORE_DETAIL_SLIDE_MS + 100);
    return () => window.clearTimeout(t);
  }, [phase, commitNavigation]);

  const surfaceStyle = useMemo(() => {
    const dragging = phase === "dragging";
    const animating = phase === "snap-back" || phase === "snap-away" || phase === "exit-active";
    const transition =
      dragging || phase === "idle"
        ? undefined
        : `transform ${STORE_DETAIL_SLIDE_MS}ms ${STORE_DETAIL_SLIDE_EXIT_EASING}`;
    const transform =
      phase === "exit-active"
        ? `translate3d(${widthRef.current}px,0,0)`
        : dragging || animating
          ? `translate3d(${dragPx}px,0,0)`
          : undefined;
    return {
      transform,
      transition: dragging ? "none" : animating ? transition : undefined,
      willChange:
        dragging || animating ? ("transform" as const) : ("auto" as const),
    } as const;
  }, [dragPx, phase]);

  return (
    <StoreCartAnimatedBackContext.Provider value={requestAnimatedBack}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {!reducedMotion ? (
          <div
            role="presentation"
            aria-hidden
            className="fixed top-0 bottom-0 left-0 z-[120] w-[18px] touch-none"
            style={{ pointerEvents: "auto" }}
            onPointerDown={onEdgePointerDown}
            onPointerMove={onEdgePointerMove}
            onPointerUp={onEdgePointerUp}
            onPointerCancel={onEdgePointerCancel}
          />
        ) : null}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          data-store-cart-swipe-phase={phase}
          style={surfaceStyle}
          onTransitionEnd={onSurfaceTransitionEnd}
        >
          {children}
        </div>
      </div>
    </StoreCartAnimatedBackContext.Provider>
  );
}

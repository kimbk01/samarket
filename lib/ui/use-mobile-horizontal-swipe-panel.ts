"use client";

import { useEffect, useRef, useState, type RefCallback, type RefObject } from "react";

const COMMIT_PX = 56;
const AXIS_RATIO = 1.25;
const SLOP = 10;
const FRICTION = 0.96;
const MAX_DRAG_FR = 0.4;
const RUBBER = 0.2;

const OUT_MS = 280;
const EASE = "cubic-bezier(0.25, 0.72, 0.2, 1)";
const SPRING_MS = 320;
const BACK_EASE = "cubic-bezier(0.33, 0.9, 0.22, 1)";

type Mode = "undecided" | "vertical" | "horizontal";

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

/**
 * 수평으로 잡히면 패널이 `translate3d`로 **손가락을 따라** 이동하고, 끌면
 * **탄성 복귀**하거나, 임계를 넘으면 **쭉 밀리는** 뒤 `onCommit*`.
 * 래퍼에 `ref={setSwipeableEl}` + `will-change-transform` (및 `touch-pan-y`).
 */
export function useMobileHorizontalSwipePanel({
  enabled,
  swipeableRef,
  onCommitNext,
  onCommitPrev,
  canGoNext,
  canGoPrev,
}: {
  enabled: boolean;
  swipeableRef: RefObject<HTMLDivElement | null>;
  onCommitNext: () => void;
  onCommitPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}): { setSwipeableEl: RefCallback<HTMLDivElement> } {
  const onNextRef = useRef(onCommitNext);
  const onPrevRef = useRef(onCommitPrev);
  const canNextRef = useRef(canGoNext);
  const canPrevRef = useRef(canGoPrev);
  onNextRef.current = onCommitNext;
  onPrevRef.current = onCommitPrev;
  canNextRef.current = canGoNext;
  canPrevRef.current = canGoPrev;

  const [swipeTarget, setSwipeTarget] = useState<HTMLDivElement | null>(null);
  const dragXRef = useRef(0);
  const modeRef = useRef<Mode>("undecided");
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSwipeableEl: RefCallback<HTMLDivElement> = (node) => {
    swipeableRef.current = node;
    setSwipeTarget(node);
  };

  useEffect(() => {
    const el = swipeTarget;
    if (!el || !enabled) return;

    const clearT = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const reset = () => {
      el.style.transition = "none";
      el.style.transform = "translate3d(0,0,0)";
      el.style.willChange = "auto";
      dragXRef.current = 0;
    };

    const onTouchStart = (e: Event) => {
      const te = e as TouchEvent;
      if (te.touches.length !== 1) return;
      const t0 = te.touches[0]!;
      startRef.current = { x: t0.clientX, y: t0.clientY };
      modeRef.current = "undecided";
      clearT();
      el.style.willChange = "transform";
      el.style.transition = "none";
    };

    const onTouchMove = (e: Event) => {
      const te = e as TouchEvent;
      if (te.touches.length !== 1) return;
      if (!startRef.current) return;
      const t0 = te.touches[0]!;
      const dx0 = t0.clientX - startRef.current.x;
      const dy0 = t0.clientY - startRef.current.y;

      if (modeRef.current === "undecided" && (Math.abs(dx0) > SLOP || Math.abs(dy0) > SLOP)) {
        if (Math.abs(dy0) * AXIS_RATIO >= Math.abs(dx0)) {
          modeRef.current = "vertical";
          return;
        }
        modeRef.current = "horizontal";
      }
      if (modeRef.current === "vertical") return;
      if (modeRef.current === "horizontal") {
        te.preventDefault();
        const w = el.offsetWidth || (typeof window !== "undefined" ? window.innerWidth : 400);
        const maxD = w * MAX_DRAG_FR;
        let x = dx0 * FRICTION;
        if (x > 0) {
          x = canPrevRef.current ? clamp(x, 0, maxD) : RUBBER * clamp(x, 0, w * 0.45);
        } else {
          x = canNextRef.current ? clamp(x, -maxD, 0) : RUBBER * clamp(x, -w * 0.45, 0);
        }
        dragXRef.current = x;
        el.style.transform = `translate3d(${x}px,0,0)`;
      }
    };

    const onTouchEnd = () => {
      if (modeRef.current !== "horizontal") {
        startRef.current = null;
        modeRef.current = "undecided";
        if (dragXRef.current !== 0) reset();
        return;
      }
      const x = dragXRef.current;
      startRef.current = null;
      modeRef.current = "undecided";

      if (x < -COMMIT_PX && canNextRef.current) {
        const w = typeof window !== "undefined" ? window.innerWidth : 400;
        el.style.transition = `transform ${OUT_MS}ms ${EASE}`;
        el.style.transform = `translate3d(${-w}px,0,0)`;
        let didRun = false;
        const runOnce = () => {
          if (didRun) return;
          didRun = true;
          clearT();
          onNextRef.current();
          reset();
        };
        const done = (ev: TransitionEvent) => {
          if (ev.propertyName !== "transform") return;
          el.removeEventListener("transitionend", done);
          runOnce();
        };
        el.addEventListener("transitionend", done);
        timerRef.current = setTimeout(() => {
          el.removeEventListener("transitionend", done);
          runOnce();
        }, OUT_MS + 100);
        return;
      }
      if (x > COMMIT_PX && canPrevRef.current) {
        const w = typeof window !== "undefined" ? window.innerWidth : 400;
        el.style.transition = `transform ${OUT_MS}ms ${EASE}`;
        el.style.transform = `translate3d(${w}px,0,0)`;
        let didRun = false;
        const runOnce = () => {
          if (didRun) return;
          didRun = true;
          clearT();
          onPrevRef.current();
          reset();
        };
        const done = (ev: TransitionEvent) => {
          if (ev.propertyName !== "transform") return;
          el.removeEventListener("transitionend", done);
          runOnce();
        };
        el.addEventListener("transitionend", done);
        timerRef.current = setTimeout(() => {
          el.removeEventListener("transitionend", done);
          runOnce();
        }, OUT_MS + 100);
        return;
      }
      if (x !== 0) {
        el.style.transition = `transform ${SPRING_MS}ms ${BACK_EASE}`;
        el.style.transform = "translate3d(0,0,0)";
        let backDone = false;
        const finish = () => {
          if (backDone) return;
          backDone = true;
          clearT();
          reset();
        };
        const onBack = (ev: TransitionEvent) => {
          if (ev.propertyName !== "transform") return;
          el.removeEventListener("transitionend", onBack);
          finish();
        };
        el.addEventListener("transitionend", onBack);
        timerRef.current = setTimeout(() => {
          el.removeEventListener("transitionend", onBack);
          finish();
        }, SPRING_MS + 100);
      } else {
        el.style.willChange = "auto";
      }
    };

    const onTouchCancel = () => {
      clearT();
      startRef.current = null;
      modeRef.current = "undecided";
      if (dragXRef.current !== 0) {
        el.style.transition = `transform ${SPRING_MS}ms ${BACK_EASE}`;
        el.style.transform = "translate3d(0,0,0)";
      }
      timerRef.current = setTimeout(() => {
        clearT();
        reset();
      }, SPRING_MS + 20);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      clearT();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [swipeTarget, enabled]);

  return { setSwipeableEl };
}

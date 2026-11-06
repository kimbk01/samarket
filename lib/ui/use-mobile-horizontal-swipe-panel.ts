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
const COMMIT_NAV_DELAY_MS = 0;
const COMMIT_CLEANUP_MS = OUT_MS + 140;
/** settle 모드 실패 복구 전용 — 목적지가 이 시간 안에 그려지지 않으면 원래 화면으로 되돌린다. */
export const SWIPE_SETTLE_TIMEOUT_MS = 3000;
/** transitionend 가 오지 않는 환경(탭 숨김·reduced motion 등)의 단계 종료 보장 */
const TRANSITION_END_GRACE_MS = 80;

type Mode = "undecided" | "vertical" | "horizontal";

/**
 * settle 모드 전환 단계 — 사용자 스와이프 1회 = exit → (await) → enter 1회.
 * - exit: 현재 화면이 스와이프 방향으로 나간다 (이동 요청 전)
 * - await: 화면 밖에서 이동을 요청하고 목적지 화면(`settleKey` 변경)을 기다린다
 * - enter: 목적지 화면이 반대편에서 들어온다
 * - recover: 이동 거부·실패 시 원래 화면이 제자리로 돌아온다
 */
type SwipePanelPhase = "idle" | "exit" | "await" | "enter" | "recover";

/** `false` = 이동을 시작하지 않음(경계·가드 거부) → settle 모드는 원위치 복구 */
export type SwipeCommitResult = boolean | void;

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

/**
 * 수평으로 잡히면 패널이 `translate3d`로 **손가락을 따라** 이동하고, 끌면
 * **탄성 복귀**하거나, 임계를 넘으면 **쭉 밀리는** 뒤 `onCommit*`.
 * 래퍼에 `ref={setSwipeableEl}` + `will-change-transform` (및 `touch-pan-y`).
 *
 * `settleKey` 를 주면 settle 모드: 고정 타이머로 되돌리지 않고, 화면 쪽이 목적지 콘텐츠를 실제로
 * 그린 시점(`settleKey` 가 commit 시점 값과 달라짐)에 반대편에서 1회 진입한다. 화면은 이 경우
 * 자체 진입 애니메이션을 같이 돌리지 않는다.
 * `settleKey` 가 없으면(거래) 기존 동작 그대로: 나간 뒤 `COMMIT_CLEANUP_MS` 에 원위치.
 */
export function useMobileHorizontalSwipePanel({
  enabled,
  swipeableRef,
  onCommitNext,
  onCommitPrev,
  canGoNext,
  canGoPrev,
  settleKey,
}: {
  enabled: boolean;
  swipeableRef: RefObject<HTMLDivElement | null>;
  onCommitNext: () => SwipeCommitResult;
  onCommitPrev: () => SwipeCommitResult;
  canGoNext: boolean;
  canGoPrev: boolean;
  settleKey?: string;
}): { setSwipeableEl: RefCallback<HTMLDivElement> } {
  const onNextRef = useRef(onCommitNext);
  const onPrevRef = useRef(onCommitPrev);
  const canNextRef = useRef(canGoNext);
  const canPrevRef = useRef(canGoPrev);
  onNextRef.current = onCommitNext;
  onPrevRef.current = onCommitPrev;
  canNextRef.current = canGoNext;
  canPrevRef.current = canGoPrev;

  const settleModeRef = useRef(settleKey !== undefined);
  settleModeRef.current = settleKey !== undefined;
  const settleKeyRef = useRef(settleKey);
  settleKeyRef.current = settleKey;
  /** 메인 effect 가 등록 — settleKey 변경을 전환 단계에 전달 */
  const onSettleKeyRef = useRef<((key: string | undefined) => void) | null>(null);

  const [swipeTarget, setSwipeTarget] = useState<HTMLDivElement | null>(null);
  const dragXRef = useRef(0);
  const modeRef = useRef<Mode>("undecided");
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitInFlightRef = useRef(false);

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
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
        navTimerRef.current = null;
      }
      if (cleanupTimerRef.current) {
        clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
    };

    const reset = () => {
      commitInFlightRef.current = false;
      el.style.transition = "none";
      el.style.transform = "translate3d(0,0,0)";
      el.style.willChange = "auto";
      dragXRef.current = 0;
    };

    /* ── settle 모드 전환 상태 ─────────────────────────────── */
    let phase: SwipePanelPhase = "idle";
    let direction: "next" | "prev" = "next";
    let fromKey: string | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let stepTimer: ReturnType<typeof setTimeout> | null = null;
    let stepEndListener: ((ev: TransitionEvent) => void) | null = null;

    const clearStep = () => {
      if (stepTimer) {
        clearTimeout(stepTimer);
        stepTimer = null;
      }
      if (stepEndListener) {
        el.removeEventListener("transitionend", stepEndListener);
        stepEndListener = null;
      }
    };
    const clearSettleTimer = () => {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
    };

    /** 패널 자체의 transform 전환이 끝나면 1회 `done` (자식 요소 transitionend 무시) */
    const runStep = (transform: string, durationMs: number, easing: string, done: () => void) => {
      clearStep();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearStep();
        done();
      };
      stepEndListener = (ev: TransitionEvent) => {
        if (ev.target !== el || ev.propertyName !== "transform") return;
        finish();
      };
      el.addEventListener("transitionend", stepEndListener);
      el.style.willChange = "transform";
      el.style.transition = `transform ${durationMs}ms ${easing}`;
      el.style.transform = transform;
      stepTimer = setTimeout(finish, durationMs + TRANSITION_END_GRACE_MS);
    };

    const finishIdle = () => {
      clearStep();
      clearSettleTimer();
      phase = "idle";
      fromKey = undefined;
      reset();
    };

    const recover = () => {
      if (phase === "idle" || phase === "recover") return;
      clearSettleTimer();
      phase = "recover";
      runStep("translate3d(0,0,0)", SPRING_MS, BACK_EASE, finishIdle);
    };

    const enter = () => {
      clearSettleTimer();
      phase = "enter";
      const width = el.offsetWidth || (typeof window !== "undefined" ? window.innerWidth : 400);
      const fromX = direction === "next" ? width : -width;
      clearStep();
      el.style.transition = "none";
      el.style.transform = `translate3d(${fromX}px,0,0)`;
      /** 시작 위치를 먼저 확정해야 반대편에서 들어오는 전환이 1회로 보인다 */
      void el.offsetWidth;
      runStep("translate3d(0,0,0)", OUT_MS, EASE, finishIdle);
    };

    const onSettleKey = (key: string | undefined) => {
      if (phase !== "await") return;
      if (key === fromKey) return;
      enter();
    };
    onSettleKeyRef.current = onSettleKey;

    /**
     * 이동은 현재 화면이 완전히 나간 뒤에 시작한다 — 목적지 콘텐츠로 바뀌는 순간이 화면 밖이어야
     * 새 화면이 나가는 패널 위에 보였다가 다시 들어오는 이중 이동이 생기지 않는다.
     */
    const commitSettled = (dir: "next" | "prev") => {
      clearT();
      commitInFlightRef.current = true;
      phase = "exit";
      direction = dir;
      const width = el.offsetWidth || (typeof window !== "undefined" ? window.innerWidth : 400);
      const targetX = dir === "next" ? -width : width;
      runStep(`translate3d(${targetX}px,0,0)`, OUT_MS, EASE, () => {
        if (phase !== "exit") return;
        phase = "await";
        fromKey = settleKeyRef.current;
        settleTimer = setTimeout(() => {
          settleTimer = null;
          if (phase === "await") recover();
        }, SWIPE_SETTLE_TIMEOUT_MS);
        const started = dir === "next" ? onNextRef.current() : onPrevRef.current();
        if (started === false) recover();
      });
    };

    const commitSwipe = (dir: "next" | "prev") => {
      if (commitInFlightRef.current) return;
      if (settleModeRef.current) {
        commitSettled(dir);
        return;
      }
      commitInFlightRef.current = true;
      clearT();
      const width = el.offsetWidth || (typeof window !== "undefined" ? window.innerWidth : 400);
      const targetX = dir === "next" ? -width : width;
      el.style.willChange = "transform";
      el.style.transition = `transform ${OUT_MS}ms ${EASE}`;
      requestAnimationFrame(() => {
        el.style.transform = `translate3d(${targetX}px,0,0)`;
      });
      navTimerRef.current = setTimeout(() => {
        navTimerRef.current = null;
        if (dir === "next") onNextRef.current();
        else onPrevRef.current();
      }, COMMIT_NAV_DELAY_MS);
      cleanupTimerRef.current = setTimeout(() => {
        cleanupTimerRef.current = null;
        reset();
      }, COMMIT_CLEANUP_MS);
    };

    const onTouchStart = (e: Event) => {
      if (commitInFlightRef.current) return;
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
      if (commitInFlightRef.current) return;
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
        /** 스크롤 진행 중 `cancelable:false`면 무시되며 콘솔 Intervention 만 유발 — 가능할 때만 막음 */
        if (te.cancelable) te.preventDefault();
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
      if (commitInFlightRef.current) return;
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
        commitSwipe("next");
        return;
      }
      if (x > COMMIT_PX && canPrevRef.current) {
        commitSwipe("prev");
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
      if (commitInFlightRef.current) return;
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
      clearStep();
      clearSettleTimer();
      if (onSettleKeyRef.current === onSettleKey) onSettleKeyRef.current = null;
      if (phase !== "idle") {
        phase = "idle";
        reset();
      }
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [swipeTarget, enabled]);

  useEffect(() => {
    onSettleKeyRef.current?.(settleKey);
  }, [settleKey]);

  return { setSwipeableEl };
}

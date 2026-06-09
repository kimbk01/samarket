"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEventHandler, RefObject } from "react";
import {
  CALL_PIP_DEFAULT_CORNER,
  clampCallPipDragDelta,
  computeCallPipCornerAnchors,
  computeCallPipDimensions,
  migrateLegacyCallPipSnapStorage,
  readCallPipInsetsFromStage,
  readCallPipSnapPosition,
  snapCallPipToNearestCorner,
  writeCallPipSnapPosition,
  type CallPipCorner,
  type CallPipInsets,
  type CallVideoPipPositionMode,
} from "@/lib/community-messenger/call-pip-metrics";
import type { VideoCallPipLayoutBindings } from "@/components/messenger/call/call-ui.types";

export type { CallVideoPipPositionMode } from "@/lib/community-messenger/call-pip-metrics";

const DRAG_THRESHOLD_PX = 10;
const DOUBLE_TAP_MS = 300;

type PipGesture = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originLeft: number;
  originTop: number;
};

export type UseCallVideoPipGestureArgs = {
  sessionId?: string | null;
  enabled?: boolean;
  positionMode?: CallVideoPipPositionMode;
  stageRef?: RefObject<HTMLDivElement | null>;
  /** 스테이지 absolute 배치 시 bottom extra fallback (CSS 변수 없을 때) */
  stageBottomExtraPx?: number;
  /** viewport-fixed 배치 시 insets override */
  viewportInsets?: CallPipInsets;
  micMuted?: boolean;
  cameraOff?: boolean;
  pipLabel: string;
  onSingleTap?: () => void;
  onExpandFullscreen?: () => void;
};

function readViewportMetrics(): {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
} {
  if (typeof window === "undefined") {
    return { width: 390, height: 844, offsetLeft: 0, offsetTop: 0 };
  }
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
    offsetLeft: vv?.offsetLeft ?? 0,
    offsetTop: vv?.offsetTop ?? 0,
  };
}

export function useCallVideoPipGesture(args: UseCallVideoPipGestureArgs): VideoCallPipLayoutBindings | null {
  const {
    enabled = true,
    positionMode = "stage-absolute",
    stageRef,
    stageBottomExtraPx = 80,
    viewportInsets,
    micMuted = false,
    cameraOff = false,
    pipLabel,
    onSingleTap,
    onExpandFullscreen,
  } = args;

  const pipRef = useRef<HTMLDivElement | null>(null);
  const internalStageRef = useRef<HTMLDivElement | null>(null);
  const resolvedStageRef = stageRef ?? internalStageRef;
  const pipGestureRef = useRef<PipGesture | null>(null);
  const pipDragMovedRef = useRef(false);
  const pipDragTransformRef = useRef({ x: 0, y: 0 });
  const pipDragRafRef = useRef(0);
  const lastTapAtRef = useRef(0);
  const singleTapTimerRef = useRef<number | null>(null);
  const bodyOverflowRef = useRef<string | null>(null);
  const bodyTouchActionRef = useRef<string | null>(null);

  const [corner, setCorner] = useState<CallPipCorner>(CALL_PIP_DEFAULT_CORNER);
  const [viewportTick, setViewportTick] = useState(0);

  useEffect(() => {
    migrateLegacyCallPipSnapStorage();
    const stored = readCallPipSnapPosition();
    setCorner(stored ?? CALL_PIP_DEFAULT_CORNER);
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const bump = () => setViewportTick((v) => v + 1);
    window.addEventListener("resize", bump);
    window.addEventListener("orientationchange", bump);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", bump);
    vv?.addEventListener("scroll", bump);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("orientationchange", bump);
      vv?.removeEventListener("resize", bump);
      vv?.removeEventListener("scroll", bump);
    };
  }, [enabled]);

  /** stage 마운트·크기 변화 시 앵커 재계산 (초기 clientWidth 0 방지) */
  useEffect(() => {
    if (!enabled || positionMode !== "stage-absolute" || typeof ResizeObserver === "undefined") return;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    let attempts = 0;

    const attach = () => {
      if (cancelled) return;
      const stageEl = resolvedStageRef.current;
      if (!stageEl) {
        attempts += 1;
        if (attempts < 90) requestAnimationFrame(attach);
        return;
      }
      const bump = () => setViewportTick((v) => v + 1);
      ro = new ResizeObserver(bump);
      ro.observe(stageEl);
      bump();
    };

    attach();
    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [enabled, positionMode, resolvedStageRef]);

  const layout = useMemo(() => {
    void viewportTick;
    const stageEl = resolvedStageRef.current;
    const viewportMetrics = readViewportMetrics();
    const viewport =
      positionMode === "stage-absolute" && stageEl
        ? {
            width: stageEl.clientWidth,
            height: stageEl.clientHeight,
          }
        : {
            width: viewportMetrics.width,
            height: viewportMetrics.height,
          };

    const pipSize = computeCallPipDimensions(viewport.width);
    const stageInsets = readCallPipInsetsFromStage(stageEl, positionMode);
    const insets =
      positionMode === "viewport-fixed"
        ? (viewportInsets ?? stageInsets)
        : {
            ...stageInsets,
            marginBottomExtra:
              stageInsets.marginBottomExtra && stageInsets.marginBottomExtra > 0
                ? stageInsets.marginBottomExtra
                : stageBottomExtraPx,
          };

    const anchors = computeCallPipCornerAnchors(viewport, pipSize, insets);
    const anchor = anchors[corner] ?? anchors[CALL_PIP_DEFAULT_CORNER];

    return {
      pipSize,
      anchor,
      anchors,
      viewport,
      insets,
      viewportOffset:
        positionMode === "viewport-fixed"
          ? { left: viewportMetrics.offsetLeft, top: viewportMetrics.offsetTop }
          : { left: 0, top: 0 },
    };
  }, [corner, positionMode, resolvedStageRef, stageBottomExtraPx, viewportInsets, viewportTick]);

  const lockBodyScroll = useCallback(() => {
    if (typeof document === "undefined") return;
    if (bodyOverflowRef.current != null) return;
    bodyOverflowRef.current = document.body.style.overflow;
    bodyTouchActionRef.current = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
  }, []);

  const unlockBodyScroll = useCallback(() => {
    if (typeof document === "undefined") return;
    if (bodyOverflowRef.current == null) return;
    document.body.style.overflow = bodyOverflowRef.current;
    document.body.style.touchAction = bodyTouchActionRef.current ?? "";
    bodyOverflowRef.current = null;
    bodyTouchActionRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      unlockBodyScroll();
      if (singleTapTimerRef.current != null) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
    };
  }, [unlockBodyScroll]);

  const applyDragTransform = useCallback((dx: number, dy: number) => {
    const el = pipRef.current;
    if (!el) return;
    pipDragTransformRef.current = { x: dx, y: dy };
    if (pipDragRafRef.current) return;
    pipDragRafRef.current = requestAnimationFrame(() => {
      pipDragRafRef.current = 0;
      const node = pipRef.current;
      if (!node) return;
      const { x, y } = pipDragTransformRef.current;
      node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  }, []);

  const resetDragTransform = useCallback(() => {
    pipDragTransformRef.current = { x: 0, y: 0 };
    if (pipDragRafRef.current) {
      cancelAnimationFrame(pipDragRafRef.current);
      pipDragRafRef.current = 0;
    }
    const el = pipRef.current;
    if (el) el.style.transform = "";
  }, []);

  const resolvePointerOrigin = useCallback(() => {
    const pipEl = pipRef.current;
    if (!pipEl) return null;

    if (positionMode === "stage-absolute" && resolvedStageRef.current) {
      const sr = resolvedStageRef.current.getBoundingClientRect();
      const pr = pipEl.getBoundingClientRect();
      return {
        originLeft: pr.left - sr.left,
        originTop: pr.top - sr.top,
      };
    }

    if (positionMode === "viewport-fixed") {
      const pr = pipEl.getBoundingClientRect();
      return {
        originLeft: pr.left - layout.viewportOffset.left,
        originTop: pr.top - layout.viewportOffset.top,
      };
    }

    return {
      originLeft: layout.anchor.left,
      originTop: layout.anchor.top,
    };
  }, [
    layout.anchor.left,
    layout.anchor.top,
    layout.viewportOffset.left,
    layout.viewportOffset.top,
    positionMode,
    resolvedStageRef,
  ]);

  const onPipPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (e) => {
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      const origin = resolvePointerOrigin();
      if (!origin) return;
      pipDragMovedRef.current = false;
      pipGestureRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originLeft: origin.originLeft,
        originTop: origin.originTop,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [enabled, resolvePointerOrigin]
  );

  const onPipPointerMove = useCallback<PointerEventHandler<HTMLDivElement>>(
    (e) => {
      const g = pipGestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const rawDx = e.clientX - g.startClientX;
      const rawDy = e.clientY - g.startClientY;
      if (Math.hypot(rawDx, rawDy) > DRAG_THRESHOLD_PX) {
        pipDragMovedRef.current = true;
        lockBodyScroll();
      }
      if (Math.hypot(rawDx, rawDy) <= 4) return;

      const { dx, dy } = clampCallPipDragDelta({
        originLeft: g.originLeft,
        originTop: g.originTop,
        dx: rawDx,
        dy: rawDy,
        pipSize: layout.pipSize,
        viewport: layout.viewport,
        insets: layout.insets,
      });
      applyDragTransform(dx, dy);
    },
    [applyDragTransform, layout.insets, layout.pipSize, layout.viewport, lockBodyScroll]
  );

  const onPipPointerUp = useCallback<PointerEventHandler<HTMLDivElement>>(
    (e) => {
      const g = pipGestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const moved = pipDragMovedRef.current;
      pipGestureRef.current = null;
      pipDragMovedRef.current = false;
      unlockBodyScroll();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }

      resetDragTransform();

      if (moved) {
        const pipEl = pipRef.current;
        if (!pipEl) return;
        const pr = pipEl.getBoundingClientRect();
        let centerX = pr.left + pr.width / 2;
        let centerY = pr.top + pr.height / 2;
        if (positionMode === "stage-absolute" && resolvedStageRef.current) {
          const sr = resolvedStageRef.current.getBoundingClientRect();
          centerX -= sr.left;
          centerY -= sr.top;
        } else if (positionMode === "viewport-fixed") {
          centerX -= layout.viewportOffset.left;
          centerY -= layout.viewportOffset.top;
        }
        const { corner: nextCorner } = snapCallPipToNearestCorner(
          { x: centerX, y: centerY },
          layout.anchors,
          layout.pipSize
        );
        setCorner(nextCorner);
        writeCallPipSnapPosition(nextCorner);
        return;
      }

      const now = Date.now();
      if (now - lastTapAtRef.current <= DOUBLE_TAP_MS) {
        lastTapAtRef.current = 0;
        if (singleTapTimerRef.current != null) {
          window.clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        onExpandFullscreen?.();
        return;
      }
      lastTapAtRef.current = now;
      if (singleTapTimerRef.current != null) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null;
        if (Date.now() - lastTapAtRef.current >= DOUBLE_TAP_MS) {
          onSingleTap?.();
        }
      }, DOUBLE_TAP_MS + 16);
    },
    [
      layout.anchors,
      layout.pipSize,
      layout.viewportOffset.left,
      layout.viewportOffset.top,
      onExpandFullscreen,
      onSingleTap,
      positionMode,
      resetDragTransform,
      resolvedStageRef,
      unlockBodyScroll,
    ]
  );

  const onPipPointerCancel = useCallback<PointerEventHandler<HTMLDivElement>>(
    (e) => {
      const g = pipGestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      pipGestureRef.current = null;
      pipDragMovedRef.current = false;
      unlockBodyScroll();
      resetDragTransform();
    },
    [resetDragTransform, unlockBodyScroll]
  );

  useLayoutEffect(() => {
    resetDragTransform();
  }, [corner, layout.anchor.left, layout.anchor.top, resetDragTransform]);

  const pipStyle: CSSProperties = useMemo(
    () => ({
      left: layout.anchor.left + layout.viewportOffset.left,
      top: layout.anchor.top + layout.viewportOffset.top,
      width: layout.pipSize.width,
      height: layout.pipSize.height,
    }),
    [
      layout.anchor.left,
      layout.anchor.top,
      layout.pipSize.height,
      layout.pipSize.width,
      layout.viewportOffset.left,
      layout.viewportOffset.top,
    ]
  );

  return useMemo(() => {
    if (!enabled) return null;
    return {
      stageRef: resolvedStageRef,
      pipRef,
      corner,
      positionMode,
      pipStyle,
      pipLabel,
      micMuted,
      cameraOff,
      onPipPointerDown,
      onPipPointerMove,
      onPipPointerUp,
      onPipPointerCancel,
      onPipExpand: onExpandFullscreen,
      widthPx: layout.pipSize.width,
      heightPx: layout.pipSize.height,
    };
  }, [
    cameraOff,
    corner,
    enabled,
    layout.pipSize.height,
    layout.pipSize.width,
    micMuted,
    onExpandFullscreen,
    onPipPointerCancel,
    onPipPointerDown,
    onPipPointerMove,
    onPipPointerUp,
    pipLabel,
    pipStyle,
    positionMode,
    resolvedStageRef,
  ]);
}

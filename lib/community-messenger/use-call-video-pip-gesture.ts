"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEventHandler, RefObject } from "react";
import {
  CALL_PIP_DEFAULT_CORNER,
  computeCallPipCornerAnchors,
  computeCallPipDimensions,
  readCallPipCornerStorage,
  readCallViewportInsetsFromDom,
  snapCallPipToNearestCorner,
  writeCallPipCornerStorage,
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
  sessionId: string | null | undefined;
  enabled?: boolean;
  positionMode?: CallVideoPipPositionMode;
  stageRef?: RefObject<HTMLDivElement | null>;
  /** 스테이지 absolute 배치 시 bottom extra (CallActionBar 등) */
  stageBottomExtraPx?: number;
  /** viewport-fixed 배치 시 insets override */
  viewportInsets?: CallPipInsets;
  micMuted?: boolean;
  cameraOff?: boolean;
  pipLabel: string;
  onSingleTap?: () => void;
  onExpandFullscreen?: () => void;
  onMinimize?: () => void;
};

function readViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 390, height: 844 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useCallVideoPipGesture(args: UseCallVideoPipGestureArgs): VideoCallPipLayoutBindings | null {
  const {
    sessionId,
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
    onMinimize,
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

  const [corner, setCorner] = useState<CallPipCorner>(CALL_PIP_DEFAULT_CORNER);
  const [viewportTick, setViewportTick] = useState(0);

  const sid = sessionId?.trim() ?? "";

  useEffect(() => {
    if (!sid) {
      setCorner(CALL_PIP_DEFAULT_CORNER);
      return;
    }
    const stored = readCallPipCornerStorage(sid);
    setCorner(stored ?? CALL_PIP_DEFAULT_CORNER);
  }, [sid]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onResize = () => setViewportTick((v) => v + 1);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [enabled]);

  const layout = useMemo(() => {
    void viewportTick;
    const viewport =
      positionMode === "stage-absolute" && resolvedStageRef.current
        ? {
            width: resolvedStageRef.current.clientWidth,
            height: resolvedStageRef.current.clientHeight,
          }
        : readViewportSize();

    const pipSize = computeCallPipDimensions(viewport.width);
    const insets =
      positionMode === "viewport-fixed"
        ? (viewportInsets ?? readCallViewportInsetsFromDom())
        : {
            safeTop: 0,
            safeBottom: 0,
            marginBottomExtra: stageBottomExtraPx,
          };

    const anchors = computeCallPipCornerAnchors(viewport, pipSize, insets);
    const anchor = anchors[corner] ?? anchors[CALL_PIP_DEFAULT_CORNER];

    return { pipSize, anchor, anchors };
  }, [corner, positionMode, resolvedStageRef, stageBottomExtraPx, viewportInsets, viewportTick]);

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

    return {
      originLeft: layout.anchor.left,
      originTop: layout.anchor.top,
    };
  }, [layout.anchor.left, layout.anchor.top, positionMode, resolvedStageRef]);

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
      const dx = e.clientX - g.startClientX;
      const dy = e.clientY - g.startClientY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) pipDragMovedRef.current = true;
      if (Math.hypot(dx, dy) <= 4) return;
      applyDragTransform(dx, dy);
    },
    [applyDragTransform]
  );

  const onPipPointerUp = useCallback<PointerEventHandler<HTMLDivElement>>(
    (e) => {
      const g = pipGestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const moved = pipDragMovedRef.current;
      pipGestureRef.current = null;
      pipDragMovedRef.current = false;
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
        const center = { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 };
        const { corner: nextCorner } = snapCallPipToNearestCorner(center, layout.anchors);
        setCorner(nextCorner);
        if (sid) writeCallPipCornerStorage(sid, nextCorner);
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
    [layout.anchors, onExpandFullscreen, onSingleTap, resetDragTransform, sid]
  );

  const onPipPointerCancel = useCallback<PointerEventHandler<HTMLDivElement>>(
    (e) => {
      const g = pipGestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      pipGestureRef.current = null;
      pipDragMovedRef.current = false;
      resetDragTransform();
    },
    [resetDragTransform]
  );

  useLayoutEffect(() => {
    resetDragTransform();
  }, [corner, layout.anchor.left, layout.anchor.top, resetDragTransform]);

  const pipStyle: CSSProperties = useMemo(
    () => ({
      left: layout.anchor.left,
      top: layout.anchor.top,
      width: layout.pipSize.width,
      height: layout.pipSize.height,
    }),
    [layout.anchor.left, layout.anchor.top, layout.pipSize.height, layout.pipSize.width]
  );

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
    onPipClose: onMinimize,
    onPipExpand: onExpandFullscreen,
    widthPx: layout.pipSize.width,
    heightPx: layout.pipSize.height,
  };
}

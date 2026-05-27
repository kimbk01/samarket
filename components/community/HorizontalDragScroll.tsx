"use client";

import { forwardRef, useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

const DRAG_SCROLL_THRESHOLD_PX = 6;

type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children: ReactNode;
  /** 탭·버튼 위에서도 가로 드래그 허용(클릭은 미세 이동만 통과) */
  allowDragFromInteractive?: boolean;
};

type DragState = {
  active: boolean;
  pointerId: number;
  startX: number;
  scrollStart: number;
  /** 이번 제스처에서 실제로 스크롤을 밀었는지 */
  dragged: boolean;
  /** 드래그 직후 1회 클릭만 막음(터치 스크롤 후 오염 방지) */
  suppressNextClick: boolean;
};

function idleDragState(): DragState {
  return {
    active: false,
    pointerId: 0,
    startX: 0,
    scrollStart: 0,
    dragged: false,
    suppressNextClick: false,
  };
}

/** 링크·버튼 등: 드래그 스크롤과 포인터 캡처로 클릭이 죽는 것 방지 */
function isInteractivePointerTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return !!target.closest("a[href], button, input, textarea, select, [role='button'], label");
}

/**
 * 가로 스크롤 영역: 터치는 네이티브 스크롤만, 마우스/펜은 드래그로 밀기.
 * - 터치 pointerdown/up 시 drag·suppress 플래그를 반드시 초기화(스크롤 후 탭 클릭 유지)
 * - 네이티브 scroll 이벤트 시에도 suppress 해제(손 뗀 뒤 클릭·탭 정상화)
 */
export const HorizontalDragScroll = forwardRef<HTMLDivElement, Props>(function HorizontalDragScroll(
  { children, className = "", style, allowDragFromInteractive = false, ...rest },
  forwardedRef
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState>(idleDragState());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const clearPointerDrag = () => {
      drag.current.active = false;
      drag.current.dragged = false;
      drag.current.suppressNextClick = false;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        clearPointerDrag();
        return;
      }
      if (e.button !== 0) return;
      if (!allowDragFromInteractive && isInteractivePointerTarget(e.target)) {
        clearPointerDrag();
        return;
      }
      drag.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        scrollStart: el.scrollLeft,
        dragged: false,
        suppressNextClick: false,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (!drag.current.active || e.pointerId !== drag.current.pointerId) return;
      const dx = e.clientX - drag.current.startX;
      if (Math.abs(dx) > DRAG_SCROLL_THRESHOLD_PX) drag.current.dragged = true;
      if (!drag.current.dragged) return;
      el.scrollLeft = drag.current.scrollStart - dx;
    };

    const end = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        clearPointerDrag();
        return;
      }
      if (!drag.current.active || e.pointerId !== drag.current.pointerId) return;
      const didDrag = drag.current.dragged;
      drag.current.active = false;
      drag.current.dragged = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (didDrag) drag.current.suppressNextClick = true;
    };

    const onLostPointerCapture = (e: PointerEvent) => {
      if (e.pointerId !== drag.current.pointerId) return;
      drag.current.active = false;
      drag.current.dragged = false;
    };

    const onScroll = () => {
      drag.current.suppressNextClick = false;
      drag.current.dragged = false;
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!drag.current.suppressNextClick) return;
      drag.current.suppressNextClick = false;
      if (isInteractivePointerTarget(e.target)) {
        if (!allowDragFromInteractive) return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", onLostPointerCapture);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("click", onClickCapture, true);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("lostpointercapture", onLostPointerCapture);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, [allowDragFromInteractive]);

  const mergedStyle: CSSProperties = {
    WebkitOverflowScrolling: "touch",
    touchAction: "pan-x",
    ...style,
  };

  return (
    <div
      ref={(node) => {
        ref.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      style={mergedStyle}
      className={`touch-pan-x overscroll-x-contain [-webkit-overflow-scrolling:touch] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});

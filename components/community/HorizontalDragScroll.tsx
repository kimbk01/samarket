"use client";

import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children: ReactNode;
};

/** 링크·버튼 등: 드래그 스크롤과 포인터 캡처로 클릭이 죽는 것 방지 */
function isInteractivePointerTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return !!target.closest("a[href], button, input, textarea, select, [role='button'], label");
}

/**
 * 가로 스크롤 영역: 터치는 네이티브 스크롤, 마우스/펜은 드래그로 밀기.
 * - 링크 위에서 포인터 캡처를 걸지 않음
 * - 이전 드래그의 moved 플래그가 링크 클릭을 막지 않음
 */
export function HorizontalDragScroll({ children, className = "", style, ...rest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({
    active: false,
    pointerId: 0,
    startX: 0,
    scrollStart: 0,
    moved: false,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (e.button !== 0) return;
      if (isInteractivePointerTarget(e.target)) {
        drag.current.active = false;
        drag.current.moved = false;
        return;
      }
      drag.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        scrollStart: el.scrollLeft,
        moved: false,
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
      if (Math.abs(dx) > 6) drag.current.moved = true;
      el.scrollLeft = drag.current.scrollStart - dx;
    };

    const end = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (!drag.current.active || e.pointerId !== drag.current.pointerId) return;
      drag.current.active = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!drag.current.moved) return;
      if (isInteractivePointerTarget(e.target)) {
        drag.current.moved = false;
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("click", onClickCapture, true);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  const mergedStyle: CSSProperties = {
    WebkitOverflowScrolling: "touch",
    ...style,
  };

  return (
    <div
      ref={ref}
      style={mergedStyle}
      className={`cursor-grab touch-pan-x overscroll-x-contain active:cursor-grabbing select-none [&_a]:select-none ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

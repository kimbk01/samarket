"use client";

import { forwardRef, type CSSProperties, type PointerEventHandler, type ReactNode } from "react";

export type MiniLocalVideoProps = {
  children?: ReactNode;
  label?: string | null;
  minimized?: boolean;
  style?: CSSProperties;
  /** 픽셀 배치 시 우하단 기본 클래스 비활성화 */
  useFreePosition?: boolean;
  className?: string;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
};

/**
 * 영상 통화 PiP — 카카오톡처럼 우하단 기본, 드래그 시 픽셀 `left`/`top` 사용.
 */
export const MiniLocalVideo = forwardRef<HTMLDivElement, MiniLocalVideoProps>(function MiniLocalVideo(
  {
    children,
    label,
    minimized = true,
    style,
    useFreePosition = false,
    className = "",
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  },
  ref
) {
  const sizeClass = minimized
    ? "h-[152px] w-[96px] sm:h-[176px] sm:w-[108px]"
    : "h-[220px] w-[128px]";
  const cornerClass = useFreePosition ? "" : "bottom-[7.4rem] right-4";

  return (
    <div
      ref={ref}
      style={style}
      className={`absolute z-[6] touch-none select-none overflow-hidden rounded-[22px] border border-white/18 bg-black/45 shadow-[0_8px_24px_rgba(0,0,0,0.28)] ${sizeClass} ${cornerClass} ${className} ${
        onPointerDown ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="pointer-events-none absolute inset-0">{children}</div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,transparent_70%,rgba(0,0,0,0.58)_100%)]" />
      {label ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-2 py-1.5 text-center text-[11px] font-medium text-white/92">
          {label}
        </div>
      ) : null}
    </div>
  );
});

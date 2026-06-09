"use client";

import { MicOff } from "lucide-react";
import { forwardRef, memo, type CSSProperties, type PointerEventHandler, type ReactNode } from "react";
import type { CallVideoPipPositionMode } from "@/lib/community-messenger/call-pip-metrics";

export type { CallVideoPipPositionMode };

export type MiniLocalVideoProps = {
  children?: ReactNode;
  label?: string | null;
  widthPx?: number;
  heightPx?: number;
  style?: CSSProperties;
  /** 픽셀 배치(left/top) 사용 시 기본 corner 클래스 비활성화 */
  useAnchoredPosition?: boolean;
  positionMode?: CallVideoPipPositionMode;
  className?: string;
  micMuted?: boolean;
  cameraOff?: boolean;
  onExpand?: () => void;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
};

/**
 * 영상 통화 PiP — 카톡/텔레그램/바이버식 세로 self view (3:4 · width×1.38) · 4모서리 스냅·드래그.
 */
const MiniLocalVideoInner = forwardRef<HTMLDivElement, MiniLocalVideoProps>(function MiniLocalVideo(
  {
    children,
    label,
    widthPx,
    heightPx,
    style,
    useAnchoredPosition = false,
    positionMode = "stage-absolute",
    className = "",
    micMuted = false,
    onExpand,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  },
  ref
) {
  const positionClass =
    positionMode === "viewport-fixed"
      ? "fixed z-[79]"
      : useAnchoredPosition
        ? "absolute z-[25]"
        : "absolute z-[25] bottom-[7.4rem] right-4";

  const sizeStyle: CSSProperties = {
    ...(widthPx != null ? { width: widthPx } : {}),
    ...(heightPx != null ? { height: heightPx } : {}),
    ...style,
  };

  return (
    <div
      ref={ref}
      style={sizeStyle}
      className={`touch-none select-none overflow-hidden rounded-[16px] border border-white/25 bg-black shadow-[0_8px_28px_rgba(0,0,0,0.4)] ${positionClass} ${className} ${
        onPointerDown ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={
        onExpand
          ? (e) => {
              e.stopPropagation();
            }
          : undefined
      }
    >
      <div className="pointer-events-none absolute inset-0">{children}</div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35)_0%,transparent_28%,transparent_62%,rgba(0,0,0,0.45)_100%)]" />

      {micMuted ? (
        <div
          className="pointer-events-none absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white"
          aria-hidden
        >
          <MicOff size={11} strokeWidth={2.25} />
        </div>
      ) : null}

      {label ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4 text-center sam-text-xxs font-medium text-white/92">
          {label}
        </div>
      ) : null}
    </div>
  );
});

export const MiniLocalVideo = memo(MiniLocalVideoInner);

"use client";

import { MicOff, VideoOff, X } from "lucide-react";
import { forwardRef, type CSSProperties, type PointerEventHandler, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  onCloseClick?: () => void;
  onExpand?: () => void;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
};

/**
 * 영상 통화 PiP — 16:9, 4모서리 스냅·드래그·indicator.
 */
export const MiniLocalVideo = forwardRef<HTMLDivElement, MiniLocalVideoProps>(function MiniLocalVideo(
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
    cameraOff = false,
    onCloseClick,
    onExpand,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  },
  ref
) {
  const { t } = useI18n();

  const positionClass =
    positionMode === "viewport-fixed"
      ? "fixed z-[79]"
      : useAnchoredPosition
        ? "absolute z-[6]"
        : "absolute z-[6] bottom-[7.4rem] right-3";

  const sizeStyle: CSSProperties = {
    ...(widthPx != null ? { width: widthPx } : {}),
    ...(heightPx != null ? { height: heightPx } : {}),
    ...style,
  };

  return (
    <div
      ref={ref}
      style={sizeStyle}
      className={`touch-none select-none overflow-hidden rounded-[14px] bg-black shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${positionClass} ${className} ${
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
          className="pointer-events-none absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"
          aria-hidden
        >
          <MicOff size={13} strokeWidth={2.25} />
        </div>
      ) : null}

      {onCloseClick ? (
        <button
          type="button"
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition active:scale-95"
          aria-label={t("cm_ui_minimize_call_window")}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onCloseClick();
          }}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      ) : null}

      {cameraOff ? (
        <div
          className="pointer-events-none absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-black/55 p-1 text-white"
          aria-hidden
        >
          <VideoOff size={13} strokeWidth={2.25} />
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

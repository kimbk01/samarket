"use client";

import { useEffect, useRef } from "react";
import { callV3BindLocalVideo, callV3GetActiveLocalTracks } from "@/lib/call-v3/call-v3-agora";

type Props = {
  label?: string;
};

/** 연결 후 우측 상단 고정 PIP — 드래그 후순위 */
export function DibayVideoPip({ label }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    callV3BindLocalVideo(el);
    const track = callV3GetActiveLocalTracks()?.videoTrack;
    if (track) {
      try {
        track.play(el);
      } catch {
        /* */
      }
    }
  });

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute right-3 top-[max(12px,env(safe-area-inset-top))] z-20 h-[120px] w-[90px] overflow-hidden rounded-ui-rect border border-white/20 bg-black/80 shadow-lg"
      aria-hidden={!label}
    >
      {label ? (
        <span className="absolute bottom-1 left-1 z-10 rounded bg-black/50 px-1 text-[10px] text-white">
          {label}
        </span>
      ) : null}
    </div>
  );
}

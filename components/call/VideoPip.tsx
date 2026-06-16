"use client";

import { useEffect, useRef } from "react";
import { callBindLocalVideo, callGetActiveLocalTracks } from "@/lib/call/call-agora";

type Props = {
  label?: string;
};

export function VideoPip({ label }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    callBindLocalVideo(el);
    const track = callGetActiveLocalTracks()?.videoTrack;
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

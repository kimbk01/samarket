"use client";

import { useLayoutEffect } from "react";
import type { StartupPresentationPaintR15 } from "@/lib/startup-presentation/engine";

export function StartupPresentationRuntime({
  paint,
  assetSrc,
  className = "",
  onVisualCommit,
}: {
  paint: StartupPresentationPaintR15;
  assetSrc?: string | null;
  className?: string;
  onVisualCommit?: () => void;
}) {
  const logo = paint.logo;
  const src = assetSrc ?? logo.asset?.publicUrl ?? null;
  useLayoutEffect(() => {
    if (src) return;
    const frame = requestAnimationFrame(() => onVisualCommit?.());
    return () => cancelAnimationFrame(frame);
  }, [onVisualCommit, src]);
  return (
    <div
      className={`relative h-full min-h-full w-full overflow-hidden ${className}`}
      style={{ backgroundColor: paint.backgroundColor }}
      data-r15-startup-generation={paint.generationId}
      data-r15-startup-runtime="system-start"
    >
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: `${logo.x * 100}%`,
          top: `${logo.y * 100}%`,
          width: `${logo.width * 100}%`,
          height: `${logo.height * 100}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="dibaY"
            className="h-full w-full object-contain"
            decoding="sync"
            onLoad={onVisualCommit}
          />
        ) : (
          <div
            className="select-none text-center font-black tracking-[-0.08em] text-[#FFFCFC]"
            style={{ fontSize: "clamp(42px, 14vw, 92px)", lineHeight: 1 }}
            aria-label={logo.label}
          >
            {logo.label}
          </div>
        )}
      </div>
    </div>
  );
}

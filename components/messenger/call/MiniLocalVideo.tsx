"use client";

import type { ReactNode } from "react";

export function MiniLocalVideo({
  children,
  label,
  minimized = true,
}: {
  children?: ReactNode;
  label?: string | null;
  minimized?: boolean;
}) {
  return (
    <div
      className={`absolute z-[3] overflow-hidden rounded-[22px] border border-white/18 bg-black/45 shadow-[0_8px_24px_rgba(0,0,0,0.28)] ${
        minimized ? "bottom-[7.4rem] right-4 h-[152px] w-[96px] sm:h-[176px] sm:w-[108px]" : "bottom-[6.5rem] right-4 h-[220px] w-[128px]"
      }`}
    >
      <div className="absolute inset-0">{children}</div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,transparent_70%,rgba(0,0,0,0.58)_100%)]" />
      {label ? (
        <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-center text-[11px] font-medium text-white/92">
          {label}
        </div>
      ) : null}
    </div>
  );
}

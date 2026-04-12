"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

const tapMin = "min-h-[var(--ui-tap-min)] min-w-[var(--ui-tap-min)]";

type PrimaryProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "solid" | "outline";
};

/** 주요 통화 액션(수락·종료 등) — 최소 터치 영역 44px. */
export function CallPrimaryButton({ children, className = "", variant = "outline", ...rest }: PrimaryProps) {
  const v =
    variant === "solid"
      ? "border border-ui-border bg-ui-fg text-ui-surface active:opacity-90"
      : "border border-ui-border bg-ui-surface text-ui-fg active:bg-ui-hover";
  return (
    <button
      type="button"
      className={`touch-manipulation rounded-ui-rect px-4 py-3 text-[15px] font-semibold transition-colors disabled:opacity-40 ${tapMin} ${v} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

type IconProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  "aria-label": string;
};

export function CallIconButton({ children, className = "", ...rest }: IconProps) {
  return (
    <button
      type="button"
      className={`inline-flex touch-manipulation items-center justify-center rounded-ui-rect border border-ui-border bg-ui-surface p-2.5 text-ui-fg transition-colors active:bg-ui-hover disabled:opacity-40 ${tapMin} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

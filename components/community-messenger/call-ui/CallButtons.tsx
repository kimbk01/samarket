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
      ? "border border-transparent bg-[color:var(--messenger-primary)] text-white active:opacity-90"
      : "border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]/95 text-[color:var(--messenger-text)] active:bg-[color:var(--messenger-primary-soft)]";
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
      className={`inline-flex touch-manipulation items-center justify-center rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]/90 p-2.5 text-[color:var(--messenger-icon)] transition-colors active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-40 ${tapMin} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

"use client";

export function CallTimer({ value, className = "" }: { value: string | null; className?: string }) {
  if (!value) return null;
  return (
    <p className={`font-mono sam-text-body-lg font-semibold tracking-[0.04em] text-white/92 sm:sam-text-page-title ${className}`.trim()}>
      {value}
    </p>
  );
}

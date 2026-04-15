"use client";

export function CallTimer({ value, className = "" }: { value: string | null; className?: string }) {
  if (!value) return null;
  return (
    <p className={`font-mono text-[16px] font-semibold tracking-[0.04em] text-white/92 sm:text-[18px] ${className}`.trim()}>
      {value}
    </p>
  );
}

"use client";

/** 목업용 미니 스파크라인(장식) — 실제 시계열 데이터 없이 형태만 맞춤 */
export function OwnerDashSparkline({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 20"
      width={48}
      height={20}
      aria-hidden
      fill="none"
    >
      <path
        d="M0 14 L8 10 L16 12 L24 6 L32 8 L40 4 L48 7"
        stroke="#1C8DB8"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}

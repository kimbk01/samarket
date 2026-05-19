"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn, ownerDashCardClass } from "./owner-dashboard-ui";

export function OwnerDashCard({
  children,
  className,
  href,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const cls = cn(ownerDashCardClass("block transition-colors active:bg-gray-50"), className);
  if (href) {
    return (
      <Link href={href} prefetch={false} className={cls} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(cls, "w-full text-left")} aria-label={ariaLabel}>
        {children}
      </button>
    );
  }
  return <div className={cls}>{children}</div>;
}

export function OwnerDashSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={ownerDashCardClass("animate-pulse space-y-2")} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded-[4px] bg-gray-100" style={{ width: `${70 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function OwnerDashOfflineBanner({ stale }: { stale?: boolean }) {
  return (
    <div
      className="rounded-[4px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-950"
      role="status"
    >
      {stale ? "오프라인 · 마지막으로 불러온 운영 데이터입니다." : "네트워크 연결을 확인해 주세요."}
    </div>
  );
}

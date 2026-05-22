"use client";

import type { ReactNode } from "react";
import Link from "next/link";

/** 1단 제목 + 선택 부제(20% 앵커 슬롯 안) */
export function AppTier1HeaderTitleCluster({
  title,
  subtitle,
  subtitleHref,
}: {
  title: ReactNode;
  subtitle?: string;
  subtitleHref?: string;
}) {
  if (!subtitle?.trim()) return title;
  return (
    <span className="flex min-w-0 max-w-full flex-col items-start gap-0.5">
      <span className="min-w-0 max-w-full truncate">{title}</span>
      {subtitleHref ? (
        <Link
          href={subtitleHref}
          className="max-w-full truncate sam-text-xxs leading-tight text-sam-muted hover:text-sam-fg hover:underline"
        >
          {subtitle}
        </Link>
      ) : (
        <span className="max-w-full truncate sam-text-xxs leading-tight text-sam-muted">{subtitle}</span>
      )}
    </span>
  );
}

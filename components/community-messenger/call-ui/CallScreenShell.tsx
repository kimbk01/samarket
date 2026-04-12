"use client";

import type { ReactNode } from "react";

type Props = {
  /** 전체 화면 오버레이(수신·진행 통화 등) */
  variant?: "overlay" | "page";
  /** 기본 `bg-ui-page` 대체(수신 오버레이는 투명 + 자식 배경) */
  surfaceClassName?: string;
  children: ReactNode;
  className?: string;
};

/**
 * 통화 풀스크린 레이아웃 — safe-area, 배경만 통일. 내용은 자식에서 구성.
 */
export function CallScreenShell({
  variant = "overlay",
  surfaceClassName = "bg-ui-page",
  children,
  className = "",
}: Props) {
  const base =
    variant === "overlay"
      ? `fixed inset-0 z-[60] flex min-h-0 flex-col ${surfaceClassName}`
      : `flex min-h-0 min-h-[100dvh] flex-col ${surfaceClassName}`;
  return (
    <div className={`${base} ${className}`.trim()}>
      {children}
    </div>
  );
}

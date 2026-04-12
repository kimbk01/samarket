"use client";

import type { ReactNode } from "react";

type Props = {
  /** 전체 화면 오버레이(수신·진행 통화 등) */
  variant?: "overlay" | "page";
  /** 오버레이 기본은 메신저 보라 그라데이션, 페이지 기본은 `bg-ui-page` */
  surfaceClassName?: string;
  children: ReactNode;
  className?: string;
};

/**
 * 통화 풀스크린 레이아웃 — safe-area, 배경만 통일. 내용은 자식에서 구성.
 */
/** 음성 통화 풀스크린·수신 오버레이 배경 — `messenger-primary` 계열 딥 그라데이션 */
export const MESSENGER_CALL_GRADIENT_SURFACE =
  "bg-gradient-to-b from-[#5042c9] via-[#3d348c] to-[#1a1635] [box-shadow:inset_0_0_100px_rgba(115,96,242,0.08)]";

const DEFAULT_OVERLAY_SURFACE = MESSENGER_CALL_GRADIENT_SURFACE;

export function CallScreenShell({
  variant = "overlay",
  surfaceClassName = variant === "overlay" ? DEFAULT_OVERLAY_SURFACE : "bg-ui-page",
  children,
  className = "",
}: Props) {
  const base =
    variant === "overlay"
      ? `fixed inset-0 z-[60] flex min-h-0 flex-col ${surfaceClassName}`
      : `flex min-h-0 min-h-[100dvh] flex-col ${surfaceClassName}`;
  return (
    <div data-messenger-shell className={`${base} ${className}`.trim()}>
      {children}
    </div>
  );
}

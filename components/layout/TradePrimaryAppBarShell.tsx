"use client";

import type { ReactNode } from "react";

/**
 * **메인 1단**·거래/매장 상단 바 — 전역 토큰(얇은 보더·그림자 없음).
 */
export const TRADE_PRIMARY_APP_BAR_SHELL_CLASS = "border-b border-sam-border bg-sam-surface";

/** Philife·플랫 커뮤니티 — 동일 셸(호환 별칭). */
export const TRADE_PRIMARY_APP_BAR_SHELL_FLAT_CLASS = "border-b border-sam-border bg-sam-surface";

/** @deprecated 하위 호환 — tailwind 클래스로 통일 */
export const TRADE_PRIMARY_APP_BAR_SHADOW_CLASS = TRADE_PRIMARY_APP_BAR_SHELL_CLASS;

type TradePrimaryAppBarShellProps = {
  children: ReactNode;
  /** true면 `AppStickyHeader`에서 메인 1단 아래 행과 한 블록으로 묶을 때 */
  embedded?: boolean;
  className?: string;
  /** `flat`: 그림자 제거(필라이프 등 메신저형 플랫 헤더) */
  variant?: "default" | "flat";
};

export function TradePrimaryAppBarShell({
  children,
  embedded,
  className,
  variant = "default",
}: TradePrimaryAppBarShellProps) {
  void embedded;

  const shell =
    variant === "flat" ? TRADE_PRIMARY_APP_BAR_SHELL_FLAT_CLASS : TRADE_PRIMARY_APP_BAR_SHELL_CLASS;

  return (
    <header
      className={`w-full min-w-0 max-w-full shrink-0 overflow-x-hidden ${shell} ${className ?? ""}`}
    >
      {children}
    </header>
  );
}

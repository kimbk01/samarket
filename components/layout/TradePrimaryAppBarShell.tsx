"use client";

import type { ReactNode } from "react";

/**
 * **메인 1단**·거래/매장 상단 바 — 인스타그램 앱바 톤(흰 배경 + 얇은 구분선).
 */
export const TRADE_PRIMARY_APP_BAR_SHELL_CLASS =
  "border-b border-ig-border bg-white shadow-[0_1px_0_rgba(0,0,0,0.05)]";

/** @deprecated 하위 호환 — tailwind 클래스로 통일 */
export const TRADE_PRIMARY_APP_BAR_SHADOW_CLASS = TRADE_PRIMARY_APP_BAR_SHELL_CLASS;

type TradePrimaryAppBarShellProps = {
  children: ReactNode;
  /** true면 `AppStickyHeader`에서 메인 1단 아래 행과 한 블록으로 묶을 때 */
  embedded?: boolean;
  className?: string;
};

export function TradePrimaryAppBarShell({
  children,
  embedded,
  className,
}: TradePrimaryAppBarShellProps) {
  void embedded;

  return (
    <header
      className={`w-full min-w-0 max-w-full shrink-0 overflow-x-hidden ${TRADE_PRIMARY_APP_BAR_SHELL_CLASS} ${className ?? ""}`}
    >
      {children}
    </header>
  );
}

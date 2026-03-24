"use client";

import type { ReactNode } from "react";

/**
 * 거래 앱 1단(RegionBar·매장 스티키 바 등) 공통 껍데기 — 배경·하단 그림자 토큰을 한곳에서 관리.
 * 컬럼 안 풀폭 배경 + 뒤로·제목·액션 한 줄은 `TradePrimaryColumnStickyAppBar`.
 * 그 외(RegionBar 등)는 이 Shell + `APP_MAIN_HEADER_INNER_CLASS` 조합.
 */
export const TRADE_PRIMARY_APP_BAR_BG = "#E8D6FF";

/** 1단 하단 그림자(모든 `TradePrimaryAppBarShell` 동일) */
export const TRADE_PRIMARY_APP_BAR_SHADOW_CLASS =
  "shadow-[0_6px_18px_-10px_rgba(15,23,42,0.18)]";

type TradePrimaryAppBarShellProps = {
  children: ReactNode;
  /** true면 AppStickyHeader에서 2행과 한 블록으로 묶을 때(API 유지, 스타일은 비임베드와 동일) */
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
      className={`w-full shrink-0 ${TRADE_PRIMARY_APP_BAR_SHADOW_CLASS} ${className ?? ""}`}
      style={{ backgroundColor: TRADE_PRIMARY_APP_BAR_BG }}
    >
      {children}
    </header>
  );
}

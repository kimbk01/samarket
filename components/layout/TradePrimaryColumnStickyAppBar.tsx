"use client";

import type { ComponentProps, ReactNode } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { TradePrimaryAppBarShell } from "@/components/layout/TradePrimaryAppBarShell";
import {
  APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS,
  APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS,
} from "@/lib/ui/app-content-layout";

export type TradePrimaryColumnStickyAppBarProps = {
  title: ReactNode;
  backButtonProps: ComponentProps<typeof AppBackButton>;
  /** 우측 액션(장바구니·알림 등). 없으면 생략 */
  actions?: ReactNode;
  /** 메인 1단(`RegionBar`)과 같이 아래 행과 붙일 때 */
  embedded?: boolean;
  /** sticky 래퍼에 추가 */
  className?: string;
  /** sticky 세로 위치 (어드민 셸 등 다른 고정 바 아래에 둘 때 `top-16` 등) */
  stickyTopClassName?: string;
  /**
   * true: 본문 `max-w` 컬럼 안에서 배경만 뷰포트 풀폭.
   * false: 이미 풀폭 레이아웃일 때(블리드·calc 생략).
   */
  viewportBleed?: boolean;
  /** `TradePrimaryAppBarShell` 안, 첫 행(뒤로·제목·액션) 아래 — 부제·칩 등 동일 배경 */
  shellFooter?: ReactNode;
  /** 헤더 밖·같은 스티키 안 — 채팅 허브 2행 탭 등 */
  stickyBelowShell?: ReactNode;
  /** true면 뒤로·제목·액션 행만 숨기고 `shellFooter`만 표시 (예: 주문 허브에서 채팅방 직접 열기) */
  hidePrimaryRow?: boolean;
  /** true면 뒤로가기만 숨김 — 제목·우측 액션은 유지 (예: `/my/business` 루트) */
  hideBackButton?: boolean;
};

/**
 * 메인 1단과 동일 **쉘**(`TradePrimaryAppBarShell`) + 본문 컬럼 정렬 한 줄(뒤로·제목·우측 액션).
 * 메인 1단을 대체하는 전용 헤더에 사용(`/orders`, 일부 매장 등). (`lib/layout/main-tier1.ts` 참고)
 */
export function TradePrimaryColumnStickyAppBar({
  title,
  backButtonProps,
  actions,
  embedded,
  className,
  stickyTopClassName = "top-0",
  viewportBleed = true,
  shellFooter,
  stickyBelowShell,
  hidePrimaryRow = false,
  hideBackButton = false,
}: TradePrimaryColumnStickyAppBarProps) {
  const shell = (
    <TradePrimaryAppBarShell embedded={embedded}>
      {!hidePrimaryRow ? (
        <div className={`flex h-14 min-w-0 items-center gap-2 overflow-hidden ${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS}`}>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {!hideBackButton ? <AppBackButton {...backButtonProps} /> : null}
            <h1 className="min-w-0 truncate text-left text-[16px] font-semibold text-foreground">{title}</h1>
          </div>
          {actions != null ? (
            <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {shellFooter}
    </TradePrimaryAppBarShell>
  );

  const stickyClasses = [
    `sticky z-20 mb-[9px] max-w-full overflow-x-hidden ${stickyTopClassName}`,
    viewportBleed ? APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={stickyClasses}>
      {shell}
      {stickyBelowShell}
    </div>
  );
}

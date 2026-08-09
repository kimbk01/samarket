"use client";

import type { ReactNode } from "react";
import { DetailHeader } from "@/components/layout/sector-header";
import { DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS } from "@/lib/layout/delivery-locked-subpage-chrome";

/**
 * 배달 잠금·로컬 크롬 서브페이지 상단 — safe-top OWNER (AppStickyHeader 없음).
 * DO NOT: 컬럼용 뷰포트 bleed(`100dvw` + `ml-[calc(50%-50dvw)]`)
 * DO NOT: 페이지 루트에 추가 `pt-[var(--safe-top)]` (이 헤더가 SSOT)
 */
export function DeliverySubpageHeader({
  title,
  onBack,
  backLabel,
  backVariant = "back",
  trailing,
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
  backVariant?: "back" | "close";
  /** 우측 액션(없으면 균형용 투명 슬롯) */
  trailing?: ReactNode;
}) {
  return (
    <header className={`delivery-ui ${DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS}`}>
      <DetailHeader
        embedded
        title={title}
        onBack={onBack}
        backVariant={backVariant}
        backAriaLabel={backLabel}
        rightSlot={trailing ?? <span className="sector-header-action pointer-events-none opacity-0" aria-hidden />}
      />
    </header>
  );
}

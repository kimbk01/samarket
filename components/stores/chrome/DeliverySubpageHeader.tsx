"use client";

import type { ReactNode } from "react";
import { DetailHeader } from "@/components/layout/sector-header";
import { APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS } from "@/lib/ui/app-content-layout";

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
    <header className={`delivery-ui ${APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS}`}>
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

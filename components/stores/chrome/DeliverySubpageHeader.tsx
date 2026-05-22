"use client";

import type { ReactNode } from "react";
import {
  DELIVERY_SUBPAGE_HEADER_ACTION_BTN_CLASS,
  DELIVERY_SUBPAGE_HEADER_BACK_BTN_CLASS,
  DELIVERY_SUBPAGE_HEADER_INNER_CLASS,
  DELIVERY_SUBPAGE_HEADER_ROW_CLASS,
  DELIVERY_SUBPAGE_HEADER_SHELL_CLASS,
  DELIVERY_SUBPAGE_HEADER_TITLE_CLASS,
} from "@/lib/design/delivery-chrome";
import { APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS } from "@/lib/ui/app-content-layout";

export function DeliverySubpageHeader({
  title,
  onBack,
  backLabel = "뒤로가기",
  trailing,
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
  /** 우측 액션(없으면 균형용 투명 슬롯) */
  trailing?: ReactNode;
}) {
  return (
    <header className={`delivery-ui ${APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS} ${DELIVERY_SUBPAGE_HEADER_SHELL_CLASS}`}>
      <div className={DELIVERY_SUBPAGE_HEADER_INNER_CLASS}>
        <div className={DELIVERY_SUBPAGE_HEADER_ROW_CLASS}>
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className={DELIVERY_SUBPAGE_HEADER_BACK_BTN_CLASS}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className={DELIVERY_SUBPAGE_HEADER_TITLE_CLASS}>{title}</h1>
          {trailing ?? (
            <span className={`${DELIVERY_SUBPAGE_HEADER_ACTION_BTN_CLASS} pointer-events-none opacity-0`} aria-hidden />
          )}
        </div>
      </div>
    </header>
  );
}

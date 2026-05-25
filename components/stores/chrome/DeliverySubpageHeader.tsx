"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS,
  DELIVERY_CONSUMER_HEADER_ROW_CLASS,
  DELIVERY_SUBPAGE_HEADER_INNER_CLASS,
  DELIVERY_SUBPAGE_HEADER_SHELL_CLASS,
} from "@/lib/design/delivery-chrome";
import { APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { DeliveryConsumerHeaderRow } from "@/components/stores/chrome/DeliveryConsumerHeaderRow";

export function DeliverySubpageHeader({
  title,
  onBack,
  backLabel,
  trailing,
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
  /** 우측 액션(없으면 균형용 투명 슬롯) */
  trailing?: ReactNode;
}) {
  const { t } = useI18n();
  const resolvedBackLabel = backLabel ?? t("nav_back");
  return (
    <header
      className={`delivery-ui ${APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS} ${DELIVERY_SUBPAGE_HEADER_SHELL_CLASS}`}
    >
      <div className={DELIVERY_SUBPAGE_HEADER_INNER_CLASS}>
        <div className={DELIVERY_CONSUMER_HEADER_ROW_CLASS}>
          <DeliveryConsumerHeaderRow
            title={title}
            leading={
              <button
                type="button"
                onClick={onBack}
                aria-label={resolvedBackLabel}
                className={DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            }
            trailing={
              trailing ?? (
                <span className={`${DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS} pointer-events-none opacity-0`} aria-hidden />
              )
            }
          />
        </div>
      </div>
    </header>
  );
}

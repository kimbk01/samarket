"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { STORE_COMMERCE_ACTION_BTN_CLASS } from "@/lib/stores/store-commerce-bottom-action-bar";

/** @deprecated `STORE_COMMERCE_ACTION_BTN_CLASS` — 시트 풀폭용 래퍼 */
export const DIBAY_CART_PRIMARY_BTN_CLASS = `flex w-full max-w-none ${STORE_COMMERCE_ACTION_BTN_CLASS}`;

export const DIBAY_CART_SECONDARY_BTN_CLASS =
  "flex w-full touch-manipulation select-none items-center justify-center rounded-[14px] border-[1.5px] border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 py-3.5 text-[15px] font-semibold text-[color:var(--overlay-text-primary)] transition-all duration-150 active:scale-[var(--overlay-press-scale)] disabled:opacity-50";

export function StoreCommerceCartBottomSheet({
  open,
  title,
  titleId: _titleId,
  busy = false,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  titleId: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <DibayBottomSheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      anchor="above-bottom-nav"
      ariaLabel={title || t("common_close")}
      footer={
        footer ? (
          <div className="shrink-0 border-t border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 pt-3 pb-[calc(var(--store-commerce-action-plane-pb,0.75rem)+var(--safe-bottom))]">
            {footer}
          </div>
        ) : undefined
      }
    >
      <div className="px-1 pb-2">{children}</div>
    </DibayBottomSheet>
  );
}

"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";

export const DIBAY_CART_PRIMARY_BTN_CLASS =
  "flex w-full touch-manipulation select-none items-center justify-center rounded-[14px] bg-[#1C8DB8] px-4 py-3.5 text-[15px] font-bold text-white shadow-sm transition-all duration-150 hover:bg-[#197DA3] active:scale-[0.97] active:bg-[#166F92] disabled:opacity-50 disabled:active:scale-100";

export const DIBAY_CART_SECONDARY_BTN_CLASS =
  "flex w-full touch-manipulation select-none items-center justify-center rounded-[14px] border-[1.5px] border-neutral-200 bg-white px-4 py-3.5 text-[15px] font-semibold text-neutral-900 transition-all duration-150 active:bg-neutral-50 disabled:opacity-50";

export function StoreCommerceCartBottomSheet({
  open,
  title,
  titleId,
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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110]" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        type="button"
        className="absolute inset-0 bg-black/45 transition-opacity duration-[220ms] disabled:pointer-events-none"
        aria-label={t("common_close")}
        onClick={onClose}
        disabled={busy}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-0 sm:px-3 sm:pb-3">
        <div
          className={`pointer-events-auto w-full min-w-0 overflow-hidden rounded-t-[24px] bg-white shadow-2xl transition-transform duration-[220ms] ease-out ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex shrink-0 flex-col items-center pt-2 pb-1">
            <span className="h-1 w-10 rounded-full bg-neutral-300" aria-hidden />
            <h2 id={titleId} className="mt-2 px-4 text-center text-[16px] font-bold leading-snug text-neutral-900">
              {title}
            </h2>
          </div>
          <div className="px-4 pb-2">{children}</div>
          {footer ? <div className="shrink-0 border-t border-neutral-100 px-4 pt-3">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

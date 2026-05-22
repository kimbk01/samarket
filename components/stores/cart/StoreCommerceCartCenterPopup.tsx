"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";

/** 디바이 장바구니 — 가운데 팝업 (radius 4px) */
export const CART_POPUP_RADIUS_CLASS = "rounded-[4px]";

export const CART_POPUP_BTN_PRIMARY =
  "w-full rounded-[var(--delivery-radius)] bg-[color:var(--delivery-primary)] py-3 text-[15px] font-bold text-white transition-colors duration-150 disabled:bg-[color:var(--delivery-btn-disabled)]";

export const CART_POPUP_BTN_SECONDARY =
  "w-full rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-white py-3 text-[15px] font-bold text-[color:var(--delivery-text-main)] disabled:opacity-50";

export const CART_POPUP_BTN_DANGER =
  "w-full rounded-[var(--delivery-radius)] bg-[color:var(--delivery-danger)] py-3 text-[15px] font-bold text-white disabled:opacity-50";

export const CART_POPUP_BTN_GHOST =
  "w-full rounded-[var(--delivery-radius)] py-2 text-[14px] font-semibold text-[color:var(--delivery-text-sub)] disabled:opacity-50";

export function StoreCommerceCartAlert({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`rounded-[var(--delivery-radius)] border border-[color:var(--delivery-danger)]/20 bg-red-50 px-3 py-2 text-[13px] font-semibold leading-[var(--delivery-lh-sub)] text-[color:var(--delivery-danger)] ${className}`}
      role="alert"
    >
      {children}
    </p>
  );
}

export function StoreCommerceCartCenterPopup({
  open,
  title,
  titleId,
  busy = false,
  onBackdropClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  titleId: string;
  busy?: boolean;
  onBackdropClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 disabled:pointer-events-none"
        aria-label={t("common_close")}
        onClick={onBackdropClose}
        disabled={busy}
      />
      <div
        className={`relative z-[1] w-full max-w-[min(92vw,24rem)] bg-white p-4 shadow-[var(--delivery-shadow-modal)] ${CART_POPUP_RADIUS_CLASS}`}
      >
        <h2 id={titleId} className="text-[22px] font-bold leading-[var(--delivery-lh-page-title)] text-[color:var(--delivery-text-main)]">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-5 flex flex-col gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

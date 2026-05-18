"use client";

import type { ReactNode } from "react";

/** 디바이 장바구니 — 가운데 팝업 (radius 4px) */
export const CART_POPUP_RADIUS_CLASS = "rounded-[4px]";

export const CART_POPUP_BTN_PRIMARY =
  "w-full rounded-[4px] bg-[#1C8DB8] py-2.5 text-[14px] font-bold text-white disabled:opacity-50";

export const CART_POPUP_BTN_SECONDARY =
  "w-full rounded-[4px] border border-neutral-300 bg-white py-2.5 text-[14px] font-semibold text-neutral-800 disabled:opacity-50";

export const CART_POPUP_BTN_DANGER =
  "w-full rounded-[4px] bg-red-600 py-2.5 text-[14px] font-bold text-white disabled:opacity-50";

export const CART_POPUP_BTN_GHOST =
  "w-full rounded-[4px] py-2 text-[14px] font-semibold text-neutral-600 disabled:opacity-50";

export function StoreCommerceCartAlert({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`rounded-[4px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold leading-relaxed text-red-700 ${className}`}
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
        aria-label="닫기"
        onClick={onBackdropClose}
        disabled={busy}
      />
      <div
        className={`relative z-[1] w-full max-w-[min(92vw,24rem)] bg-white p-4 shadow-xl ${CART_POPUP_RADIUS_CLASS}`}
      >
        <h2 id={titleId} className="text-[15px] font-bold leading-snug text-neutral-900">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
        {footer ? <div className="mt-4 flex flex-col gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

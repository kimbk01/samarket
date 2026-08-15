"use client";

import type { ReactNode } from "react";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/** 디바이 장바구니 — overlay radius (kept for inner list cards) */
export const CART_POPUP_RADIUS_CLASS = "rounded-[var(--overlay-radius-sm,8px)]";

export const CART_POPUP_BTN_PRIMARY = OverlayUi.btn.primary;
export const CART_POPUP_BTN_SECONDARY = OverlayUi.btn.secondary;
export const CART_POPUP_BTN_DANGER = OverlayUi.btn.destructive;
export const CART_POPUP_BTN_GHOST = OverlayUi.btn.text;

export function StoreCommerceCartAlert({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`${OverlayUi.body} rounded-[var(--overlay-radius-sm,8px)] border border-[color:var(--overlay-danger)]/20 bg-red-50 px-3 py-2 text-left font-semibold text-[color:var(--overlay-danger)] ${className}`}
      role="alert"
      style={{ color: "var(--overlay-danger, #E53935)" }}
    >
      {children}
    </p>
  );
}

export function StoreCommerceCartCenterPopup({
  open,
  title,
  titleId: _titleId,
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
  return (
    <DibayDialog
      open={open}
      onClose={busy ? undefined : onBackdropClose}
      dismissible={!busy}
      title={title}
    >
      <div className="mt-3 text-left">{children}</div>
      {footer ? <div className={OverlayUi.actionsStack}>{footer}</div> : null}
    </DibayDialog>
  );
}

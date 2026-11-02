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
      className={`${OverlayUi.body} ${OverlayUi.bodySecondary} rounded-[var(--overlay-radius-sm,8px)] border border-[color:color-mix(in_srgb,var(--overlay-danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--overlay-danger)_8%,#ffffff)] px-3 py-2 text-left font-semibold ${className}`}
      role="alert"
      style={{ color: "var(--overlay-danger)" }}
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
      footer={footer ? <div className={OverlayUi.actionsStack}>{footer}</div> : undefined}
    >
      <div className="mt-3 text-left">{children}</div>
    </DibayDialog>
  );
}

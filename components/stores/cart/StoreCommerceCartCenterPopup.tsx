"use client";

import type { ReactNode } from "react";
import {
  DeliveryModal,
  type DeliveryModalPlacement,
} from "@/components/delivery/ui/DeliveryModal";
export const CART_POPUP_RADIUS_CLASS = "rounded-[4px]";

export type StoreCommerceCartPopupPlacement = DeliveryModalPlacement;

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
  placement = "center",
}: {
  open: boolean;
  title: string;
  titleId: string;
  busy?: boolean;
  onBackdropClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  placement?: StoreCommerceCartPopupPlacement;
}) {
  return (
    <DeliveryModal
      open={open}
      title={title}
      titleId={titleId}
      busy={busy}
      onBackdropClose={onBackdropClose}
      footer={footer}
      placement={placement}
    >
      {children}
    </DeliveryModal>
  );
}

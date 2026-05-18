"use client";

import type { ReactNode } from "react";
import { DeliverySheet } from "@/components/delivery/ui/DeliverySheet";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export const DIBAY_CART_PRIMARY_BTN_CLASS = DeliveryTheme.btn.primary;
export const DIBAY_CART_SECONDARY_BTN_CLASS =
  `${DeliveryTheme.btn.primary} border border-[var(--delivery-border-light)] !bg-white !text-[var(--delivery-text-main)]`;

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
  return (
    <DeliverySheet
      open={open}
      title={title}
      titleId={titleId}
      busy={busy}
      onClose={onClose}
      footer={footer}
    >
      {children}
    </DeliverySheet>
  );
}

"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  DeliveryTheme,
  type DeliveryButtonSize,
  type DeliveryButtonVariant,
} from "@/lib/design/delivery-theme";

const variantClass: Record<Exclude<DeliveryButtonVariant, "cancel">, string> = {
  primary: DeliveryTheme.btn.primary,
  secondary: DeliveryTheme.btn.secondary,
  outline: DeliveryTheme.btn.outline,
  ghost: DeliveryTheme.btn.ghost,
  danger: DeliveryTheme.btn.danger,
};

const sizeClass: Record<DeliveryButtonSize, string> = {
  sm: DeliveryTheme.btn.sizeSm,
  md: DeliveryTheme.btn.sizeMd,
  lg: DeliveryTheme.btn.sizeLg,
  full: DeliveryTheme.btn.sizeFull,
};

export function DeliveryButton({
  variant = "primary",
  size = "full",
  sticky = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: DeliveryButtonVariant;
  size?: DeliveryButtonSize;
  sticky?: boolean;
  children: ReactNode;
}) {
  const { type = "button", ...rest } = props;
  const resolvedVariant = variant === "cancel" ? "ghost" : variant;
  const classes = [
    variantClass[resolvedVariant],
    sizeClass[size],
    sticky ? DeliveryTheme.btn.sticky : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}

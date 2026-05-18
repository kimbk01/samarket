"use client";

import type { InputHTMLAttributes } from "react";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export function DeliveryInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${DeliveryTheme.input} ${className}`.trim()} {...props} />;
}

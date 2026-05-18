"use client";

import type { ReactNode } from "react";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export function DeliveryStickyCTA({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <footer className={`${DeliveryTheme.sticky.root} ${className}`.trim()}>
      <div className={DeliveryTheme.sticky.inner}>{children}</div>
    </footer>
  );
}

import type { HTMLAttributes, ReactNode } from "react";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export function DeliveryCard({
  padded = true,
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`${DeliveryTheme.card} ${padded ? DeliveryTheme.cardPad : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

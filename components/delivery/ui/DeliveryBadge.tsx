import type { ReactNode } from "react";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

type Tone = "primary" | "popular" | "discount" | "soldout";

const toneClass: Record<Tone, string> = {
  primary: DeliveryTheme.badge.primary,
  popular: DeliveryTheme.badge.popular,
  discount: DeliveryTheme.badge.discount,
  soldout: DeliveryTheme.badge.soldOut,
};

export function DeliveryBadge({
  tone = "primary",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`${DeliveryTheme.badge.base} ${toneClass[tone]} ${className}`.trim()}>
      {children}
    </span>
  );
}

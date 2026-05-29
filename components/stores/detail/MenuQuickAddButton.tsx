"use client";

import type { MouseEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryTheme } from "@/lib/design/delivery-theme";

export function MenuQuickAddButton({
  title,
  disabled,
  onPress,
  size = "list",
  className = "",
}: {
  title: string;
  disabled?: boolean;
  onPress: (e: MouseEvent<HTMLButtonElement>) => void;
  size?: "list" | "compact";
  className?: string;
}) {
  const { t } = useI18n();
  if (disabled) return null;
  const sizeClass = size === "compact" ? "delivery-menu-plus--compact" : "";
  return (
    <button
      type="button"
      onClick={onPress}
      className={`${DeliveryTheme.menuPlus} ${sizeClass} ${className}`.trim()}
      aria-label={t("store_add_to_cart_aria", { title })}
    >
      +
    </button>
  );
}

"use client";

import type { MouseEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryTheme } from "@/lib/design/delivery-theme";
import {
  STORE_MENU_QUICK_ADD_BTN_VISUAL_CLASS,
  STORE_MENU_QUICK_ADD_GLYPH_CLASS,
  STORE_MENU_QUICK_ADD_SIZE_CLASS,
} from "@/lib/stores/store-menu-quick-add-button-styles";

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
  return (
    <button
      type="button"
      onClick={onPress}
      className={`${DeliveryTheme.menuPlus} ${STORE_MENU_QUICK_ADD_BTN_VISUAL_CLASS} ${STORE_MENU_QUICK_ADD_SIZE_CLASS[size]} ${className}`.trim()}
      aria-label={t("store_add_to_cart_aria", { title })}
    >
      <span className={STORE_MENU_QUICK_ADD_GLYPH_CLASS} aria-hidden>
        +
      </span>
    </button>
  );
}

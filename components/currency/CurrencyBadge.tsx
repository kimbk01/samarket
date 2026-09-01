"use client";

import type { CurrencyVisualVariant } from "@/lib/currency/currency-ssot-hard-lock";
import { CURRENCY_DISPLAY_LABELS } from "@/lib/currency/currency-display-contract";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const BADGE_CLASS: Record<CurrencyVisualVariant, string> = {
  point: "currency-badge--point",
  coin: "currency-badge--coin",
  cash: "currency-badge--cash",
};

export function CurrencyBadge({
  currency,
  className = "",
}: {
  currency: CurrencyVisualVariant;
  className?: string;
}) {
  const { language } = useI18n();
  const lang = language === "ko" ? "ko" : "en";
  const label = CURRENCY_DISPLAY_LABELS[currency][lang];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-ui-rect px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${BADGE_CLASS[currency]} ${className}`}
      data-currency-badge={currency}
    >
      {label}
    </span>
  );
}

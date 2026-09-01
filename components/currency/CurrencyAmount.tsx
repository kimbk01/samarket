"use client";

import type { CurrencyVisualVariant } from "@/lib/currency/currency-ssot-hard-lock";
import { formatCurrencyAmount } from "@/lib/currency/currency-display-contract";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const AMOUNT_CLASS: Record<CurrencyVisualVariant, string> = {
  point: "currency-amount--point",
  coin: "currency-amount--coin",
  cash: "currency-amount--cash",
};

export function CurrencyAmount({
  currency,
  amount,
  isMinor = false,
  compactPoint = false,
  signed = false,
  className = "",
}: {
  currency: CurrencyVisualVariant;
  amount: number;
  isMinor?: boolean;
  compactPoint?: boolean;
  signed?: boolean;
  className?: string;
}) {
  const { language } = useI18n();
  const locale = catalogDateLocale(language);
  const raw = Math.trunc(Number(amount) || 0);
  const formatted = formatCurrencyAmount({
    currency,
    amount: Math.abs(raw),
    isMinor,
    compactPoint,
    locale,
  });
  const prefix = signed && raw !== 0 ? (raw > 0 ? "+" : "−") : "";

  return (
    <span
      className={`tabular-nums font-bold ${AMOUNT_CLASS[currency]} ${className}`}
      data-currency-amount={currency}
    >
      {prefix}
      {formatted}
    </span>
  );
}

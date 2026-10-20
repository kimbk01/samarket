"use client";

import type { ReactNode } from "react";
import type { CurrencyVisualVariant } from "@/lib/currency/currency-ssot-hard-lock";
import { CURRENCY_DISPLAY_DESCRIPTIONS } from "@/lib/currency/currency-display-contract";
import { CurrencyAmount } from "@/components/currency/CurrencyAmount";
import { CurrencyActionGroup, type CurrencyActionSpec } from "@/components/currency/CurrencyActionGroup";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const CARD_CLASS: Record<CurrencyVisualVariant, string> = {
  point: "currency-card--point",
  coin: "currency-card--coin",
  cash: "currency-card--cash",
};

export function CurrencyBalanceCard({
  currency,
  amount,
  isMinor = false,
  compactPoint = false,
  actions = [],
  footer,
  className = "",
}: {
  currency: CurrencyVisualVariant;
  /** Display-only balance from canonical finance API. null = 아직 모름·조회 실패 → "—" (0 으로 표시 금지) */
  amount: number | null;
  isMinor?: boolean;
  compactPoint?: boolean;
  actions?: CurrencyActionSpec[];
  footer?: ReactNode;
  className?: string;
}) {
  const { language } = useI18n();
  const lang = language === "ko" ? "ko" : "en";
  const description = CURRENCY_DISPLAY_DESCRIPTIONS[currency][lang];

  return (
    <section
      className={`rounded-ui-rect border p-4 shadow-sm ${CARD_CLASS[currency]} ${className}`}
      data-currency-balance-card={currency}
    >
      <div className="flex items-start justify-between gap-2">
        <CurrencyBadge currency={currency} />
      </div>
      <div className="mt-3">
        {amount === null ? (
          <span className="text-2xl font-bold tabular-nums text-sam-muted sm:text-[1.75rem]" data-currency-amount-unavailable>
            —
          </span>
        ) : (
          <CurrencyAmount
            currency={currency}
            amount={amount}
            isMinor={isMinor}
            compactPoint={compactPoint}
            className="text-2xl sm:text-[1.75rem]"
          />
        )}
      </div>
      <p className="mt-2 text-sm text-sam-muted">{description}</p>
      {actions.length > 0 ? (
        <CurrencyActionGroup currency={currency} actions={actions} className="mt-4" />
      ) : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import type { CurrencyVisualVariant } from "@/lib/currency/currency-ssot-hard-lock";
import {
  CURRENCY_ALLOWED_ACTIONS,
  type CurrencyActionId,
} from "@/lib/currency/currency-display-contract";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { catalogPair } from "@/lib/i18n/catalog-pair";

export type CurrencyActionSpec = {
  id: CurrencyActionId;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
};

const ACTION_LABELS: Record<CurrencyActionId, { ko: string; en: string }> = {
  recharge: catalogPair("currency_top_up"),
  history: catalogPair("currency_history"),
  convert_to_cash: catalogPair("currency_convert_to_cash"),
  withdraw: catalogPair("currency_withdraw"),
  top_up: catalogPair("currency_top_up"),
  convert_from_coin: catalogPair("currency_from_coin"),
};

function filterAllowedActions(
  currency: CurrencyVisualVariant,
  actions: CurrencyActionSpec[]
): CurrencyActionSpec[] {
  const allowed = CURRENCY_ALLOWED_ACTIONS[currency];
  return actions.filter((a) => (allowed as readonly string[]).includes(a.id));
}

export function CurrencyActionGroup({
  currency,
  actions,
  className = "",
}: {
  currency: CurrencyVisualVariant;
  actions: CurrencyActionSpec[];
  className?: string;
}) {
  const { language } = useI18n();
  const lang = language === "ko" ? "ko" : "en";
  const filtered = filterAllowedActions(currency, actions);

  if (!filtered.length) return null;

  return (
    <div
      className={`flex flex-wrap items-stretch gap-2 ${className}`}
      data-currency-actions={currency}
      data-owner-cta-group="currency"
    >
      {filtered.map((action) => {
        const label = ACTION_LABELS[action.id][lang];
        const btnClass = action.primary ? OwnerCta.formPrimary : OwnerCta.formSecondary;
        if (action.href) {
          return (
            <Link
              key={action.id}
              href={action.href}
              className={btnClass}
              data-currency-action={action.id}
              data-owner-cta={action.primary ? "primary" : "secondary"}
            >
              {label}
            </Link>
          );
        }
        return (
          <button
            key={action.id}
            type="button"
            className={btnClass}
            disabled={action.disabled}
            onClick={action.onClick}
            data-currency-action={action.id}
            data-owner-cta={action.primary ? "primary" : "secondary"}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

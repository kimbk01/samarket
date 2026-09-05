"use client";

import Link from "next/link";
import type { CurrencyVisualVariant } from "@/lib/currency/currency-ssot-hard-lock";
import {
  CURRENCY_ALLOWED_ACTIONS,
  type CurrencyActionId,
} from "@/lib/currency/currency-display-contract";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerCta } from "@/lib/business/owner-cta-classes";

export type CurrencyActionSpec = {
  id: CurrencyActionId;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
};

const ACTION_LABELS: Record<CurrencyActionId, { ko: string; en: string }> = {
  recharge: { ko: "충전", en: "Top up" },
  history: { ko: "내역", en: "History" },
  convert_to_cash: { ko: "Cash로 전환", en: "Convert to Cash" },
  withdraw: { ko: "외부 출금", en: "Withdraw" },
  top_up: { ko: "충전", en: "Top up" },
  convert_from_coin: { ko: "Coin에서 전환", en: "From Coin" },
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

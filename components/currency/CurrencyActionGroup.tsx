"use client";

import Link from "next/link";
import type { CurrencyVisualVariant } from "@/lib/currency/currency-ssot-hard-lock";
import {
  CURRENCY_ALLOWED_ACTIONS,
  type CurrencyActionId,
} from "@/lib/currency/currency-display-contract";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";

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
  withdraw: { ko: "환전 신청", en: "Withdraw" },
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
  const { language, safeT } = useI18n();
  const lang = language === "ko" ? "ko" : "en";
  const filtered = filterAllowedActions(currency, actions);

  if (!filtered.length) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`} data-currency-actions={currency}>
      {filtered.map((action) => {
        const label = ACTION_LABELS[action.id][lang];
        const btnClass = action.primary ? Sam.btn.primary : Sam.btn.secondary;
        if (action.href) {
          return (
            <Link
              key={action.id}
              href={action.href}
              className={`inline-flex min-h-[40px] items-center justify-center rounded-ui-rect px-3 text-sm font-semibold ${btnClass}`}
              data-currency-action={action.id}
            >
              {label}
            </Link>
          );
        }
        return (
          <button
            key={action.id}
            type="button"
            className={`inline-flex min-h-[40px] items-center justify-center rounded-ui-rect px-3 text-sm font-semibold ${btnClass}`}
            disabled={action.disabled}
            onClick={action.onClick}
            data-currency-action={action.id}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

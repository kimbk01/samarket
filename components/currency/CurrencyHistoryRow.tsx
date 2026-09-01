"use client";

import type { CurrencyVisualVariant } from "@/lib/currency/currency-ssot-hard-lock";
import { CurrencyAmount } from "@/components/currency/CurrencyAmount";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function CurrencyHistoryRow({
  currency,
  title,
  amount,
  isMinor = false,
  signed = true,
  createdAt,
  status,
  detailHref,
}: {
  currency: CurrencyVisualVariant;
  title: string;
  amount: number;
  isMinor?: boolean;
  signed?: boolean;
  createdAt?: string | null;
  status?: string | null;
  detailHref?: string;
}) {
  const { language } = useI18n();
  const locale = catalogDateLocale(language);
  const when =
    createdAt && createdAt.trim()
      ? new Date(createdAt).toLocaleString(locale, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <li
      className="flex flex-wrap items-start justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2.5"
      data-currency-history-row={currency}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <CurrencyBadge currency={currency} />
          {status ? (
            <span className="sam-text-xxs font-medium text-sam-muted">{status}</span>
          ) : null}
        </div>
        <p className="text-sm font-medium text-sam-fg">{title}</p>
        {when ? <p className="sam-text-xxs text-sam-muted">{when}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        <CurrencyAmount
          currency={currency}
          amount={amount}
          isMinor={isMinor}
          signed={signed}
          className="text-base"
        />
        {detailHref ? (
          <a href={detailHref} className="mt-1 block sam-text-xxs text-sam-primary underline-offset-2 hover:underline">
            Detail
          </a>
        ) : null}
      </div>
    </li>
  );
}

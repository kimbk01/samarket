"use client";

import Link from "next/link";
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
  reference,
}: {
  currency: CurrencyVisualVariant;
  title: string;
  amount: number;
  isMinor?: boolean;
  signed?: boolean;
  createdAt?: string | null;
  status?: string | null;
  detailHref?: string;
  /** Optional ledger reference (e.g. related_type · related_id). */
  reference?: string | null;
}) {
  const { language } = useI18n();
  const locale = catalogDateLocale(language);
  const when =
    createdAt && createdAt.trim()
      ? `${new Date(createdAt).toLocaleString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          // 시간 기준 = 필리핀 (기기 시간대와 무관 · 날짜 묶음 머리줄과 같은 날짜)
          timeZone: "Asia/Manila",
        })} PHT`
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
        {reference ? (
          <p className="sam-text-xxs break-all text-sam-muted" data-currency-history-reference="1">
            {reference}
          </p>
        ) : null}
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
          // 앱 안 이동 — 전체 다시 로드 없이 (D-13)
          <Link
            href={detailHref}
            className="mt-1 inline-flex min-h-11 min-w-11 items-center justify-end sam-text-xxs text-sam-primary underline-offset-2 hover:underline"
          >
            {language === "en" ? "Details" : "자세히"}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  financeCashInTodayHref,
  financeCashOutTodayHref,
  financeCoinEarnedTodayHref,
  financeOutstandingHref,
  financeWithdrawalsHref,
} from "@/lib/finance/routes";
import { formatFinanceAmount } from "@/lib/finance/presentation";

export type FinanceSummaryStripModel = {
  /** null = aggregate not available (do not invent 0) */
  todayCashInMinor: number | null;
  todayCashOutMinor: number | null;
  todayCoinEarned: number | null;
  outstandingMinor: number;
  pendingActions: number;
};

function cashOrDash(
  amount: number | null | undefined,
  opts?: { loading?: boolean }
): string {
  if (opts?.loading) return "…";
  if (amount == null) return "—";
  return formatFinanceAmount({ wallet: "CASH", amount, isMinor: true });
}

function coinOrDash(
  amount: number | null | undefined,
  opts?: { loading?: boolean }
): string {
  if (opts?.loading) return "…";
  if (amount == null) return "—";
  return formatFinanceAmount({ wallet: "COIN", amount });
}

export function FinanceSummaryStrip({
  model,
}: {
  ko: boolean;
  model: FinanceSummaryStripModel | null;
}) {
  const { t } = useI18n();
  const loading = model == null;
  const items = [
    {
      key: "cash_in",
      label: t("finance_cash_in_today"),
      value: cashOrDash(model?.todayCashInMinor, { loading }),
      href: financeCashInTodayHref(),
    },
    {
      key: "cash_out",
      label: t("finance_cash_out_today"),
      value: cashOrDash(model?.todayCashOutMinor, { loading }),
      href: financeCashOutTodayHref(),
    },
    {
      key: "coin",
      label: t("finance_coin_earned_today"),
      value: coinOrDash(model?.todayCoinEarned, { loading }),
      href: financeCoinEarnedTodayHref(),
    },
    {
      key: "outstanding",
      label: t("finance_outstanding_fees"),
      value: formatFinanceAmount({
        wallet: "CASH",
        amount: model?.outstandingMinor ?? 0,
        isMinor: true,
      }),
      href: financeOutstandingHref(),
    },
    {
      key: "pending",
      label: t("finance_action_required"),
      value: String(model?.pendingActions ?? 0),
      href: financeWithdrawalsHref(),
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      data-finance-summary-strip="1"
    >
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 hover:border-signature"
          data-finance-summary={it.key}
        >
          <div className="sam-text-xxs text-sam-muted">{it.label}</div>
          <div className="mt-0.5 font-semibold tabular-nums text-sam-fg">{it.value}</div>
        </Link>
      ))}
    </div>
  );
}

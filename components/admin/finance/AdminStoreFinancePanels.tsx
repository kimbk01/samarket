"use client";

import Link from "next/link";
import { AdminCoinWithdrawalsPanel } from "@/components/admin/finance/AdminCoinWithdrawalsPanel";
import { CurrencyBadge } from "@/components/currency/CurrencyBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** Admin finance — paired Coin (Gold) + Cash (Green) sections per CUT 3/5. */
export function AdminStoreFinancePanels() {
  const { safeT } = useI18n();

  return (
    <div className="space-y-4" data-admin-store-finance-panels="1">
      <AdminCoinWithdrawalsPanel />

      <section
        className="rounded-ui-rect border border-[var(--currency-cash-border)] bg-[var(--currency-cash-bg)] p-4"
        data-admin-cash-finance-panel="1"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CurrencyBadge currency="cash" />
            <h2 className="text-base font-semibold text-sam-fg">
              Cash top-up & operating funds
            </h2>
          </div>
          <Link
            href="/admin/delivery-ads/cash-charges"
            className="text-sm font-semibold text-[var(--currency-cash-accent)] underline-offset-2 hover:underline"
          >
            Top-up queue
          </Link>
        </div>
        <p className="text-sm text-sam-muted">
          Ads and Partner spend use AST-005 Business Cash only. Balances stay separate from Coin.
        </p>
      </section>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";

export function AdminFinanceWithdrawalsShell({ children }: { children: ReactNode }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  return (
    <div className="space-y-4" data-admin-finance-withdrawals="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-[16px] font-semibold text-sam-fg">{t("admin_finance_coin_withdrawals")}</h2>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_finance_coin_payout_requests_only_cash_withdrawal")}
      </p>
      {children}
    </div>
  );
}

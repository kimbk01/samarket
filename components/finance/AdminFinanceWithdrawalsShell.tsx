"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";

export function AdminFinanceWithdrawalsShell({ children }: { children: ReactNode }) {
  const { language } = useI18n();
  const ko = language !== "en";
  return (
    <div className="space-y-4" data-admin-finance-withdrawals="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-lg font-semibold">{ko ? "Coin 출금" : "Coin withdrawals"}</h2>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "Coin 외부 지급 신청만 처리합니다. Cash 출금은 없습니다. 전환(Coin→Cash)과 다릅니다."
          : "Coin payout requests only. Cash withdrawal does not exist. Separate from Coin→Cash conversion."}
      </p>
      {children}
    </div>
  );
}

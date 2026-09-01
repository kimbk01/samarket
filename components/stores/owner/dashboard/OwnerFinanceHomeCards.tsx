"use client";

import { useCallback, useEffect, useState } from "react";
import { CurrencyBalanceCard } from "@/components/currency";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";

type FinanceSummary = {
  ok?: boolean;
  error?: string;
  assets?: {
    storePoints?: { balance?: number };
    businessCash?: { balanceMinor?: number };
  };
};

export function OwnerFinanceHomeCards({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coinBalance, setCoinBalance] = useState(0);
  const [cashBalanceMinor, setCashBalanceMinor] = useState(0);
  const financeHref = OwnerRoutes.finance(storeId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/finance`, {
        credentials: "include",
      });
      const payload = (await response.json()) as FinanceSummary;
      if (!response.ok || payload.ok === false) {
        setError(resolveOwnerApiErrorMessage(payload.error, t));
        return;
      }
      setCoinBalance(Math.trunc(Number(payload.assets?.storePoints?.balance) || 0));
      setCashBalanceMinor(
        Math.trunc(Number(payload.assets?.businessCash?.balanceMinor) || 0)
      );
    } catch {
      setError(t("common_error"));
    } finally {
      setLoading(false);
    }
  }, [storeId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" data-owner-finance-home-cards="1">
      {error ? <p className="text-sm text-sam-danger sm:col-span-2">{error}</p> : null}
      <CurrencyBalanceCard
        currency="coin"
        amount={coinBalance}
        actions={[
          { id: "convert_to_cash", href: `${financeHref}#cash-manage`, primary: true },
          { id: "withdraw", href: `${financeHref}#coin-withdraw` },
          { id: "history", href: `${financeHref}#coin-history` },
        ]}
      />
      <CurrencyBalanceCard
        currency="cash"
        amount={cashBalanceMinor}
        isMinor
        actions={[
          { id: "top_up", href: `${financeHref}#cash-manage`, primary: true },
          { id: "convert_from_coin", href: `${financeHref}#cash-manage` },
          { id: "history", href: `${financeHref}#cash-history` },
        ]}
      />
    </div>
  );
}

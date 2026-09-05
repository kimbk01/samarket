"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
import { ownerDashCardClass } from "./owner-dashboard-ui";

type FinanceSummary = {
  ok?: boolean;
  error?: string;
  assets?: {
    storePoints?: { balance?: number };
    businessCash?: { balanceMinor?: number };
  };
};

/** Home secondary finance strip — balances only; full actions live on Finance page. */
export function OwnerFinanceHomeCards({ storeId }: { storeId: string }) {
  const { t, language } = useI18n();
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
      setCashBalanceMinor(Math.trunc(Number(payload.assets?.businessCash?.balanceMinor) || 0));
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
    return (
      <div className={ownerDashCardClass()} data-owner-finance-home-cards="1">
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      </div>
    );
  }

  return (
    <div className={ownerDashCardClass()} data-owner-finance-home-cards="1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-sam-fg">
            {ownerUiCopy(language, "Coin · Cash · 정산", "Coin · Cash · Settlements")}
          </h2>
          <p className="mt-0.5 text-xs text-sam-muted">
            {ownerUiCopy(
              language,
              "잔액·전환은 재무, 주문 매출·수수료는 정산",
              "Balances in Finance; order sales & fees in Settlements"
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <Link
            href={financeHref}
            className="rounded-ui-rect bg-sam-primary px-3 py-1.5 text-xs font-semibold text-white"
            data-owner-home-finance-open="1"
          >
            {ownerUiCopy(language, "재무", "Finance")}
          </Link>
          <Link
            href={OwnerRoutes.settlements(storeId)}
            className="rounded-ui-rect border border-sam-primary-border bg-sam-primary-soft px-3 py-1.5 text-xs font-semibold text-sam-primary"
            data-owner-home-settlements-open="1"
          >
            {ownerUiCopy(language, "정산", "Settlements")}
          </Link>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-sam-danger">{error}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
          <p className="text-[11px] text-sam-muted">Coin</p>
          <p className="text-base font-bold tabular-nums text-sam-fg">
            {coinBalance.toLocaleString()}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
          <p className="text-[11px] text-sam-muted">Cash</p>
          <p className="text-base font-bold tabular-nums text-sam-fg">
            ₱{Math.trunc(cashBalanceMinor / 100).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

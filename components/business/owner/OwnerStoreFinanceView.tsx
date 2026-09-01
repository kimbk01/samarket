"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyBalanceCard, CurrencyHistoryRow } from "@/components/currency";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerBusinessCashView } from "@/components/business/owner/OwnerBusinessCashView";
import { OwnerCoinWithdrawalPanel } from "@/components/business/owner/OwnerCoinWithdrawalPanel";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";

type LedgerRow = {
  id: string;
  entryKind: string;
  amount?: number;
  amountMinor?: number;
  direction?: string;
  createdAt: string;
};

type FinancePayload = {
  assets?: {
    storePoints?: { balance?: number };
    businessCash?: { balanceMinor?: number };
  };
  storePointsLedger?: LedgerRow[];
  businessCashLedger?: LedgerRow[];
  saleFeeObligations?: {
    outstandingMinor?: number;
    openCount?: number;
  };
};

function mapCoinLedgerTitle(kind: string): string {
  switch (kind) {
    case "SALE_EARN":
      return "Sale earning";
    case "REVERSAL":
      return "Refund reversal";
    case "GIFT_REDEMPTION_EARN":
      return "Gift redemption earning";
    case "CONVERT_TO_BUSINESS_CASH":
      return "Cash conversion";
    case "WITHDRAWAL_REQUEST":
      return "Withdrawal request";
    case "WITHDRAWAL_RELEASE":
      return "Withdrawal release";
    case "WITHDRAWAL_COMPLETE":
      return "Withdrawal paid";
    default:
      return kind;
  }
}

function mapCashLedgerTitle(kind: string): string {
  switch (kind) {
    case "TOP_UP":
      return "Top-up";
    case "CONVERT_FROM_STORE_POINTS":
      return "Coin conversion";
    case "AD_SPEND":
      return "Ad spend";
    case "AD_REFUND":
      return "Ad refund";
    case "PARTNER_SPEND":
      return "Partner spend";
    case "PARTNER_REFUND":
      return "Partner refund";
    case "SALE_FEE":
      return "Sale fee";
    case "SALE_FEE_SETTLEMENT":
      return "Sale fee settlement";
    default:
      return kind;
  }
}

export function OwnerStoreFinanceView({ storeId }: { storeId: string }) {
  const { t, safeT } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coinBalance, setCoinBalance] = useState(0);
  const [cashBalanceMinor, setCashBalanceMinor] = useState(0);
  const [saleFeeOutstandingMinor, setSaleFeeOutstandingMinor] = useState(0);
  const [coinLedger, setCoinLedger] = useState<LedgerRow[]>([]);
  const [cashLedger, setCashLedger] = useState<LedgerRow[]>([]);
  const financeHref = OwnerRoutes.finance(storeId);
  const cashManageHref = `${financeHref}#cash-manage`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/finance`, {
        credentials: "include",
      });
      const json = (await res.json()) as FinancePayload & { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setError(resolveOwnerApiErrorMessage(json.error, t));
        return;
      }
      setCoinBalance(Math.trunc(Number(json.assets?.storePoints?.balance) || 0));
      setCashBalanceMinor(Math.trunc(Number(json.assets?.businessCash?.balanceMinor) || 0));
      setSaleFeeOutstandingMinor(Math.trunc(Number(json.saleFeeObligations?.outstandingMinor) || 0));
      setCoinLedger(json.storePointsLedger ?? []);
      setCashLedger(json.businessCashLedger ?? []);
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
    <div className="space-y-4" data-owner-store-finance="1">
      <div>
        <h1 className="text-lg font-semibold text-sam-fg">
          {safeT("owner_finance_title", {
            fallbackKo: "매장 재무",
            fallbackEn: "Store finance",
          })}
        </h1>
        <p className="mt-1 text-sm text-sam-muted">
          {safeT("owner_finance_description", {
            fallbackKo: "Coin(매장 수익)과 캐시(운영 자금)는 별도 통화입니다.",
            fallbackEn: "Coin (earnings) and Cash (operating funds) are separate currencies.",
          })}
        </p>
      </div>

      {error ? <p className="text-sm text-sam-danger">{error}</p> : null}

      <CurrencyBalanceCard
        currency="coin"
        amount={coinBalance}
        actions={[
          { id: "convert_to_cash", href: `${cashManageHref}`, primary: true },
          {
            id: "withdraw",
            href: `${financeHref}#coin-withdraw`,
          },
          { id: "history", href: `${financeHref}#coin-history` },
        ]}
      />

      <OwnerCoinWithdrawalPanel storeId={storeId} onSubmitted={load} />

      <CurrencyBalanceCard
        currency="cash"
        amount={cashBalanceMinor}
        isMinor
        actions={[
          { id: "top_up", href: `${cashManageHref}`, primary: true },
          { id: "convert_from_coin", href: `${cashManageHref}` },
          { id: "history", href: `${financeHref}#cash-history` },
        ]}
      />

      {saleFeeOutstandingMinor > 0 ? (
        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-4 py-3 text-sm"
          data-sale-fee-outstanding="1"
        >
          <p className="font-semibold text-sam-fg">
            {safeT("owner_finance_sale_fee_title", {
              fallbackKo: "미납 판매 수수료",
              fallbackEn: "Outstanding sale fees",
            })}
          </p>
          <p className="mt-1 text-sam-muted">
            <span className="font-medium text-sam-fg">
              ₱{Math.trunc(saleFeeOutstandingMinor / 100).toLocaleString()}
            </span>
            {" — "}
            {safeT("owner_finance_sale_fee_body", {
              fallbackKo: "캐시 충전 또는 Coin→캐시 전환 시 우선 정산됩니다.",
              fallbackEn: "Settled first on Cash top-up or Coin→Cash conversion.",
            })}
          </p>
        </div>
      ) : null}

      <OwnerStoreAdminDashSection
        title={safeT("owner_finance_coin_history", {
          fallbackKo: "Coin 내역",
          fallbackEn: "Coin history",
        })}
      >
        <ul id="coin-history" className="space-y-2">
          {coinLedger.length === 0 ? (
            <li className="text-sm text-sam-muted">{t("store_owner_point_ledger_empty")}</li>
          ) : (
            coinLedger.slice(0, 20).map((row) => (
              <CurrencyHistoryRow
                key={row.id}
                currency="coin"
                title={mapCoinLedgerTitle(row.entryKind)}
                amount={Math.trunc(Number(row.amount) || 0)}
                signed
                createdAt={row.createdAt}
              />
            ))
          )}
        </ul>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_finance_cash_history_title", {
          fallbackKo: "캐시 내역",
          fallbackEn: "Cash history",
        })}
      >
        <ul id="cash-history" className="space-y-2">
          {cashLedger.length === 0 ? (
            <li className="text-sm text-sam-muted">
              {safeT("owner_finance_history_empty", {
                fallbackKo: "내역이 없습니다.",
                fallbackEn: "No history yet.",
              })}
            </li>
          ) : (
            cashLedger.slice(0, 20).map((row) => {
              const minor = Math.trunc(Number(row.amountMinor ?? row.amount) || 0);
              return (
                <CurrencyHistoryRow
                  key={row.id}
                  currency="cash"
                  title={mapCashLedgerTitle(row.entryKind)}
                  amount={minor}
                  isMinor
                  signed
                  createdAt={row.createdAt}
                />
              );
            })
          )}
        </ul>
      </OwnerStoreAdminDashSection>

      <div id="cash-manage">
        <OwnerBusinessCashView storeId={storeId} manageOnly onChanged={load} />
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  CurrencyBalanceCard,
  CurrencyHistoryRow,
  LegacyCreditBadge,
} from "@/components/currency";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerStorePointWarningCard } from "@/components/business/owner/OwnerStorePointWarningCard";
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

function financeT(
  safeT: (key: MessageKey, fallbacks?: string | { fallbackKo: string; fallbackEn: string }) => string,
  fallbackKo: string,
  fallbackEn: string
): string {
  return safeT("common_loading", { fallbackKo, fallbackEn });
}

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
  const [legacyPointBalance, setLegacyPointBalance] = useState(0);
  const [legacyBlocked, setLegacyBlocked] = useState(false);

  const financeHref = `/stores/owner/finance?storeId=${encodeURIComponent(storeId)}`;
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

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/points`, {
          credentials: "include",
        });
        const json = (await res.json()) as {
          summary?: { pointBalance?: number; pointCommerceBlocked?: boolean };
        };
        setLegacyPointBalance(Math.trunc(Number(json.summary?.pointBalance) || 0));
        setLegacyBlocked(json.summary?.pointCommerceBlocked === true);
      } catch {
        /* legacy section optional */
      }
    })();
  }, [storeId]);

  if (loading) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  return (
    <div className="space-y-4" data-owner-store-finance="1">
      <div>
        <h1 className="text-lg font-semibold text-sam-fg">
          {financeT(safeT, "매장 재무", "Store Finance")}
        </h1>
        <p className="mt-1 text-sm text-sam-muted">
          {financeT(
            safeT,
            "Coin(매장 수익)과 Cash(운영 자금)는 별도 통화입니다.",
            "Coin (earnings) and Cash (operating funds) are separate currencies."
          )}
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

      <OwnerStoreAdminDashSection
        title={financeT(safeT, "Coin 환전 신청", "Coin withdrawal")}
      >
        <p id="coin-withdraw" className="text-sm text-sam-muted">
          {financeT(
            safeT,
            "환전은 Coin 잔액에서 신청됩니다. 상품권 환전 메뉴에서도 동일 rail을 사용합니다.",
            "Withdrawals debit Coin balance. Gift cash-out uses the same rail."
          )}
        </p>
        <Link
          href={OwnerRoutes.giftCertificatesMoney(storeId)}
          className="mt-2 inline-flex text-sm font-semibold text-[var(--currency-coin-accent)] underline-offset-2 hover:underline"
        >
          {financeT(safeT, "환전 신청하기", "Request withdrawal")}
        </Link>
      </OwnerStoreAdminDashSection>

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
            {financeT(safeT, "미납 판매 수수료", "Outstanding sale fees")}
          </p>
          <p className="mt-1 text-sam-muted">
            {financeT(
              safeT,
              `₱${Math.trunc(saleFeeOutstandingMinor / 100).toLocaleString()} — Cash 충전 또는 Coin→Cash 전환 시 우선 정산됩니다.`,
              `₱${Math.trunc(saleFeeOutstandingMinor / 100).toLocaleString()} — settled first on Cash top-up or Coin→Cash conversion.`
            )}
          </p>
        </div>
      ) : null}

      <OwnerStoreAdminDashSection
        title={financeT(safeT, "Business Credit (운영 수수료)", "Business Credit (operations fee)")}
      >
        <div className="mb-2">
          <LegacyCreditBadge />
        </div>
        <OwnerStorePointWarningCard
          storeId={storeId}
          pointBalance={legacyPointBalance}
          pointCommerceBlocked={legacyBlocked}
        />
        <p className="mt-2 text-xs text-sam-muted">
          {financeT(
            safeT,
            "주문 수락 수수료용 레거시 잔액입니다. Coin/Cash와 별도입니다.",
            "Legacy balance for order-accept fees. Separate from Coin/Cash."
          )}
        </p>
        <Link
          href={OwnerRoutes.points(storeId)}
          className="mt-2 inline-flex text-sm font-semibold text-sam-primary underline-offset-2 hover:underline"
        >
          {t("store_owner_point_title")}
        </Link>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={financeT(safeT, "Coin 내역", "Coin history")}
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
        title={financeT(safeT, "Cash 내역", "Cash history")}
      >
        <ul id="cash-history" className="space-y-2">
          {cashLedger.length === 0 ? (
            <li className="text-sm text-sam-muted">
              {financeT(safeT, "내역이 없습니다.", "No history yet.")}
            </li>
          ) : (
            cashLedger.slice(0, 20).map((row) => {
              const debit = row.direction === "debit";
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
        <div id="cash-manage" className="mt-3">
          <Link
            href={`/stores/owner/business-cash?storeId=${encodeURIComponent(storeId)}&returnTo=${encodeURIComponent(financeHref)}`}
            className="inline-flex min-h-[40px] items-center rounded-ui-rect bg-[var(--currency-cash-accent)] px-3 text-sm font-semibold text-white"
          >
            {financeT(safeT, "Cash 충전 · 전환 관리", "Manage Cash top-up & conversion")}
          </Link>
        </div>
      </OwnerStoreAdminDashSection>
    </div>
  );
}

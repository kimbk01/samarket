"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyBalanceCard, CurrencyHistoryRow } from "@/components/currency";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerBusinessCashView } from "@/components/business/owner/OwnerBusinessCashView";
import { OwnerCoinWithdrawalPanel } from "@/components/business/owner/OwnerCoinWithdrawalPanel";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
import { fetchOwnerStoreSettlementsDeduped } from "@/lib/business/fetch-owner-store-settlements-deduped";
import { summarizeOwnerStoreSettlements } from "@/lib/business/summarize-owner-store-settlements";
import type { OwnerStoreSettlementRow } from "@/lib/business/owner-store-settlement-types";

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

/**
 * Finance story (STORE OS) — real fields only.
 * A settlement summary → B fees → C Coin/Cash → D convert → E withdraw → F history.
 */
export function OwnerStoreFinanceView({ storeId }: { storeId: string }) {
  const { t, safeT, language } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coinBalance, setCoinBalance] = useState(0);
  const [cashBalanceMinor, setCashBalanceMinor] = useState(0);
  const [saleFeeOutstandingMinor, setSaleFeeOutstandingMinor] = useState(0);
  const [coinLedger, setCoinLedger] = useState<LedgerRow[]>([]);
  const [cashLedger, setCashLedger] = useState<LedgerRow[]>([]);
  const [settleSummary, setSettleSummary] = useState<ReturnType<
    typeof summarizeOwnerStoreSettlements
  > | null>(null);
  const financeHref = OwnerRoutes.finance(storeId);
  const settlementsHref = OwnerRoutes.settlements(storeId);
  const cashManageHref = `${financeHref}#cash-manage`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [financeRes, settleRes] = await Promise.all([
        fetch(`/api/me/stores/${encodeURIComponent(storeId)}/finance`, {
          credentials: "include",
        }),
        fetchOwnerStoreSettlementsDeduped(storeId),
      ]);
      const json = (await financeRes.json()) as FinancePayload & { ok?: boolean; error?: string };
      if (!financeRes.ok || json.ok === false) {
        setError(resolveOwnerApiErrorMessage(json.error, t));
        return;
      }
      setCoinBalance(Math.trunc(Number(json.assets?.storePoints?.balance) || 0));
      setCashBalanceMinor(Math.trunc(Number(json.assets?.businessCash?.balanceMinor) || 0));
      setSaleFeeOutstandingMinor(Math.trunc(Number(json.saleFeeObligations?.outstandingMinor) || 0));
      setCoinLedger(json.storePointsLedger ?? []);
      setCashLedger(json.businessCashLedger ?? []);

      if (settleRes.status === 200 && settleRes.json && typeof settleRes.json === "object") {
        const body = settleRes.json as { ok?: boolean; settlements?: OwnerStoreSettlementRow[] };
        if (body.ok !== false && Array.isArray(body.settlements)) {
          setSettleSummary(summarizeOwnerStoreSettlements(body.settlements));
        } else {
          setSettleSummary(null);
        }
      } else {
        setSettleSummary(null);
      }
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
    <div className="space-y-5" data-owner-store-finance="1">
      <div>
        <h1 className="text-lg font-semibold text-sam-fg">
          {safeT("owner_finance_title", {
            fallbackKo: "매장 재무",
            fallbackEn: "Store finance",
          })}
        </h1>
        <p className="mt-1 text-sm text-sam-muted">
          {safeT("owner_finance_description", {
            fallbackKo:
              "매출·수수료·정산은 정산 내역에서, Coin·Cash·충전·전환·환전은 아래에서 확인합니다. 없는 숫자는 만들지 않습니다.",
            fallbackEn:
              "Sales, fees, and settlement live under Settlements; Coin, Cash, top-up, convert, and withdraw are below. Missing values are not invented.",
          })}
        </p>
      </div>

      {error ? <p className="text-sm text-sam-danger">{error}</p> : null}

      <OwnerStoreAdminDashSection
        title={ownerUiCopy(language, "A. 매출 · 정산 요약", "A. Sales · settlement summary")}
      >
        <p className="mb-3 text-xs text-sam-muted">
          {ownerUiCopy(
            language,
            "주문별 gross / 수수료 / net / 지급 상태는 정산 화면이 권위입니다.",
            "Per-order gross, fees, net, and payout status are authoritative on Settlements."
          )}
        </p>
        {settleSummary ? (
          <dl className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">{ownerUiCopy(language, "건수", "Count")}</dt>
              <dd className="font-semibold text-sam-fg">{settleSummary.count}</dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">{ownerUiCopy(language, "Gross", "Gross")}</dt>
              <dd className="font-semibold text-sam-fg">
                ₱{Math.trunc(settleSummary.gross).toLocaleString()}
              </dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">
                {ownerUiCopy(language, "플랫폼 수수료", "Platform fee")}
              </dt>
              <dd className="font-semibold text-sam-fg">
                ₱{Math.trunc(settleSummary.platformFee).toLocaleString()}
              </dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">{ownerUiCopy(language, "환불", "Refund")}</dt>
              <dd className="font-semibold text-sam-fg">
                ₱{Math.trunc(settleSummary.refund).toLocaleString()}
              </dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">
                {ownerUiCopy(language, "지급 예정 net", "Pending net")}
              </dt>
              <dd className="font-semibold text-sam-fg">
                ₱{Math.trunc(settleSummary.pendingNet).toLocaleString()}
              </dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">
                {ownerUiCopy(language, "지급 완료 net", "Paid net")}
              </dt>
              <dd className="font-semibold text-sam-fg">
                ₱{Math.trunc(settleSummary.paidNet).toLocaleString()}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mb-3 text-xs text-sam-muted" data-owner-finance-missing="settlement_summary">
            MISSING_BACKEND_VISIBILITY: settlement summary unavailable on this load
          </p>
        )}
        <Link
          href={settlementsHref}
          className={`${OwnerCta.primary} ${OwnerCta.block} sm:w-auto`}
          data-owner-finance-settlements-cta="1"
        >
          {ownerUiCopy(language, "정산 내역 열기", "Open settlements")}
        </Link>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={ownerUiCopy(language, "B. 수수료 · 차감", "B. Fees · deductions")}
      >
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
        ) : (
          <p className="text-sm text-sam-muted">
            {ownerUiCopy(
              language,
              "미납 판매 수수료 없음. 주문 수수료 상세는 정산 내역의 주문별 행을 보세요.",
              "No outstanding sale fees. Per-order commission detail is on each settlement row."
            )}
          </p>
        )}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={ownerUiCopy(language, "C. Coin · Cash 잔액", "C. Coin · Cash balances")}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <CurrencyBalanceCard
            currency="coin"
            amount={coinBalance}
            actions={[
              { id: "convert_to_cash", href: cashManageHref, primary: true },
              { id: "history", href: `${financeHref}#coin-history` },
            ]}
          />
          <CurrencyBalanceCard
            currency="cash"
            amount={cashBalanceMinor}
            isMinor
            actions={[
              { id: "top_up", href: cashManageHref, primary: true },
              { id: "history", href: `${financeHref}#cash-history` },
            ]}
          />
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={ownerUiCopy(language, "D. 내부 전환 (Coin → Cash)", "D. Internal conversion (Coin → Cash)")}
      >
        <p className="mb-3 text-xs text-sam-muted">
          {ownerUiCopy(
            language,
            "DIBAY 내부에서 Coin을 Cash로 바꿉니다. 외부 은행/GCash 출금과 다릅니다.",
            "Converts Coin to Cash inside DIBAY. This is not an external bank/GCash payout."
          )}
        </p>
        <div id="cash-manage">
          <OwnerBusinessCashView storeId={storeId} manageOnly onChanged={load} />
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={ownerUiCopy(language, "E. 외부 출금 · 환전", "E. External payout / withdrawal")}
      >
        <p className="mb-3 text-xs text-sam-muted">
          {ownerUiCopy(
            language,
            "Coin을 외부 계좌·GCash로 보내는 신청입니다. 내부 Coin→Cash 전환과 분리됩니다.",
            "Request to send Coin to an external account/GCash. Separate from internal Coin→Cash conversion."
          )}
        </p>
        <div id="coin-withdraw">
          <OwnerCoinWithdrawalPanel storeId={storeId} onSubmitted={load} />
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_finance_coin_history", {
          fallbackKo: "F. Coin 내역",
          fallbackEn: "F. Coin history",
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
          fallbackKo: "G. 캐시 내역",
          fallbackEn: "G. Cash history",
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
    </div>
  );
}

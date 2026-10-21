"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyBalanceCard, CurrencyHistoryRow } from "@/components/currency";
import { OwnerBusinessCashView } from "@/components/business/owner/OwnerBusinessCashView";
import { OwnerCoinWithdrawalPanel } from "@/components/business/owner/OwnerCoinWithdrawalPanel";
import { OwnerFinanceNav } from "@/components/finance/OwnerFinanceNav";
import { OwnerFinanceStoreSwitcher } from "@/components/finance/OwnerFinanceStoreSwitcher";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { ownerUiCopy } from "@/lib/business/owner-ui-copy";
import type {
  StoreCommissionLedgerSummary,
  StorePlatformPayableSummary,
} from "@/lib/stores/commission/load-store-commission-ledger";
import { buildStoreCommissionLedgerSearch } from "@/lib/stores/commission/store-commission-ledger-query";
import {
  COIN_TO_CASH_LABEL_KO,
  COIN_WITHDRAWAL_LABEL_KO,
} from "@/lib/finance/product-decision-lock";
import { normalizeOwnerFinanceSection, ownerFinanceSectionHref } from "@/lib/finance/routes";
import { formatFinanceAmount } from "@/lib/finance/presentation";

type LedgerRow = {
  id: string;
  entryKind: string;
  amount?: number;
  amountMinor?: number;
  direction?: string;
  relatedType?: string | null;
  relatedId?: string | null;
  createdAt: string;
};

/** F-15 — server-computed sums over the same N most recent Coin ledger rows. */
type CoinRecentWindow = {
  rowCount: number;
  earned: number;
  converted: number;
  withdrawn: number;
  reversed: number;
};

type FinancePayload = {
  assets?: {
    storePoints?: { balance?: number };
    businessCash?: { balanceMinor?: number };
  };
  storePointsLedger?: LedgerRow[];
  storePointsRecentWindow?: CoinRecentWindow;
  businessCashLedger?: LedgerRow[];
  saleFeeObligations?: {
    outstandingMinor?: number;
    openCount?: number;
    rows?: Array<{
      id: string;
      orderId: string;
      orderNo?: string;
      confirmedRevenuePhp: number;
      feeDueMinor: number;
      feePaidMinor: number;
      feeOutstandingMinor: number;
      status: string;
      createdAt: string;
    }>;
  };
};

function mapCoinLedgerTitle(language: "ko" | "en", kind: string): string {
  switch (kind) {
    case "SALE_EARN":
      return ownerUiCopy(language, "판매 적립", "Sale earning");
    case "REVERSAL":
      return ownerUiCopy(language, "취소/반전", "Reversal");
    case "GIFT_REDEMPTION_EARN":
      return ownerUiCopy(language, "상품권 사용 수익", "Gift redemption earning");
    case "CONVERT_TO_BUSINESS_CASH":
      return ownerUiCopy(language, "Cash 전환", "Cash conversion");
    case "WITHDRAWAL_REQUEST":
      return ownerUiCopy(language, "Coin 환전 신청", "Coin cash-out request");
    case "WITHDRAWAL_RELEASE":
      return ownerUiCopy(language, "Coin 환전 해제", "Coin cash-out release");
    case "WITHDRAWAL_COMPLETE":
      return ownerUiCopy(language, "Coin 환전 완료", "Coin cash-out paid");
    default:
      return ownerUiCopy(language, "Coin 내역", "Coin entry");
  }
}

function mapCashLedgerTitle(language: "ko" | "en", kind: string): string {
  switch (kind) {
    case "TOP_UP":
      return ownerUiCopy(language, "충전", "Top-up");
    case "CONVERT_FROM_STORE_POINTS":
      return ownerUiCopy(language, "Coin 전환", "Coin conversion");
    case "AD_SPEND":
      return ownerUiCopy(language, "광고", "Ad spend");
    case "AD_REFUND":
      return ownerUiCopy(language, "광고 환불", "Ad refund");
    case "PARTNER_SPEND":
      return ownerUiCopy(language, "Partner", "Partner spend");
    case "PARTNER_REFUND":
      return ownerUiCopy(language, "Partner 환불", "Partner refund");
    case "SALE_FEE":
      return ownerUiCopy(language, "수수료", "Sale fee");
    case "SALE_FEE_SETTLEMENT":
      return ownerUiCopy(language, "미납 회수", "Fee settlement");
    default:
      return ownerUiCopy(language, "Cash 내역", "Cash entry");
  }
}

/** Small reference line (related_type · related_id) for ledger rows; null when absent. */
function ledgerReference(row: LedgerRow): string | null {
  const type = String(row.relatedType ?? "").trim();
  const id = String(row.relatedId ?? "").trim();
  if (!type && !id) return null;
  const shortId = id.length > 12 ? `${id.slice(0, 8)}…` : id;
  return [type, shortId].filter(Boolean).join(" · ");
}

function signedCashMinor(row: LedgerRow): number {
  const minor = Math.abs(Math.trunc(Number(row.amountMinor ?? row.amount) || 0));
  const dir = String(row.direction ?? "").toLowerCase();
  if (dir === "debit" || dir === "out" || dir === "spend") return -minor;
  if (dir === "credit" || dir === "in") return minor;
  return Math.trunc(Number(row.amountMinor ?? row.amount) || 0);
}

/**
 * Owner Finance — same read-model story as Admin, owner-scoped section shell.
 */
export function OwnerStoreFinanceView({ storeId }: { storeId: string }) {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = normalizeOwnerFinanceSection(searchParams.get("section"));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coinBalance, setCoinBalance] = useState(0);
  const [cashBalanceMinor, setCashBalanceMinor] = useState(0);
  const [saleFeeOutstandingMinor, setSaleFeeOutstandingMinor] = useState(0);
  const [obligationRows, setObligationRows] = useState<
    NonNullable<NonNullable<FinancePayload["saleFeeObligations"]>["rows"]>
  >([]);
  const [coinLedger, setCoinLedger] = useState<LedgerRow[]>([]);
  const [coinRecentWindow, setCoinRecentWindow] = useState<CoinRecentWindow | null>(null);
  const [cashLedger, setCashLedger] = useState<LedgerRow[]>([]);
  /** This month (Asia/Manila) — same SQL readers as the settlement screen (commission SSOT). */
  const [commissionMonth, setCommissionMonth] = useState<{
    summary: StoreCommissionLedgerSummary;
    payable: StorePlatformPayableSummary | null;
  } | null>(null);

  const settlementsHref = OwnerRoutes.settlements(storeId);
  const convertHref = ownerFinanceSectionHref(storeId, "convert");
  const withdrawHref = ownerFinanceSectionHref(storeId, "withdraw");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [financeRes, ledgerRes] = await Promise.all([
        fetch(`/api/me/stores/${encodeURIComponent(storeId)}/finance`, {
          credentials: "include",
        }),
        fetch(
          `/api/me/stores/${encodeURIComponent(storeId)}/commission-ledger?${buildStoreCommissionLedgerSearch({ period: "this_month", limit: 1 })}`,
          { credentials: "include" }
        ).catch(() => null),
      ]);
      const json = (await financeRes.json()) as FinancePayload & { ok?: boolean; error?: string };
      if (!financeRes.ok || json.ok === false) {
        setError(resolveOwnerApiErrorMessage(json.error, t));
        return;
      }
      setCoinBalance(Math.trunc(Number(json.assets?.storePoints?.balance) || 0));
      setCashBalanceMinor(Math.trunc(Number(json.assets?.businessCash?.balanceMinor) || 0));
      setSaleFeeOutstandingMinor(Math.trunc(Number(json.saleFeeObligations?.outstandingMinor) || 0));
      setObligationRows(json.saleFeeObligations?.rows ?? []);
      setCoinLedger(json.storePointsLedger ?? []);
      setCoinRecentWindow(json.storePointsRecentWindow ?? null);
      setCashLedger(json.businessCashLedger ?? []);

      const ledger = ledgerRes?.ok
        ? ((await ledgerRes.json().catch(() => null)) as {
            ok?: boolean;
            summary?: StoreCommissionLedgerSummary;
            payableSummary?: StorePlatformPayableSummary;
          } | null)
        : null;
      setCommissionMonth(
        ledger?.ok && ledger.summary ? { summary: ledger.summary, payable: ledger.payableSummary ?? null } : null
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

  // IA-12 — 구 `?section=orders`(탭 제거) → `transactions` 로 URL 정규화 (북마크 호환).
  const rawSection = searchParams.get("section")?.trim() ?? "";
  useEffect(() => {
    if (rawSection !== "orders") return;
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("section", "transactions");
    router.replace(`/stores/owner/finance?${qs.toString()}`, { scroll: false });
  }, [rawSection, router, searchParams]);

  // Legacy deep links (#cash-manage / #cash-history) → section shell.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "").trim();
    if (!hash) return;
    const targetSection =
      hash === "cash-manage"
        ? "convert"
        : hash === "cash-history"
          ? "cash"
          : hash === "coin-history"
            ? "coin"
            : hash === "coin-withdraw"
              ? "withdraw"
              : null;
    if (!targetSection || section === targetSection) return;
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("storeId", storeId);
    qs.set("section", targetSection);
    router.replace(`/stores/owner/finance?${qs.toString()}#${hash}`);
  }, [router, searchParams, section, storeId]);

  const recentN = coinRecentWindow?.rowCount ?? 0;
  const recentLabel = (koLabel: string, enLabel: string) =>
    ownerUiCopy(language, `최근 ${recentN}건 기준 ${koLabel}`, `${enLabel} (last ${recentN} entries)`);
  const recentValue = (amount: number | undefined) =>
    coinRecentWindow ? formatFinanceAmount({ wallet: "COIN", amount: amount ?? 0 }) : "—";

  if (loading) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  return (
    <div className="space-y-4 pb-8" data-owner-store-finance="1">
      <div>
        <h1 className="text-lg font-semibold text-sam-fg">
          {safeT("owner_finance_title", {
            fallbackKo: "매장 재무",
            fallbackEn: "Store finance",
          })}
        </h1>
        <p className="mt-1 text-sm text-sam-muted">
          {safeT("owner_finance_description", {
            fallbackKo: "Admin과 같은 재무 데이터·흐름입니다. 매장 범위만 적용됩니다.",
            fallbackEn: "Same finance data and flow as Admin, scoped to your store.",
          })}
        </p>
      </div>

      <OwnerFinanceStoreSwitcher storeId={storeId} section={section} ko={ko} />
      <OwnerFinanceNav storeId={storeId} ko={ko} />

      {error ? <p className="text-sm text-sam-danger">{error}</p> : null}

      {section === "transactions" ? (
        <section className="space-y-3" data-owner-finance-section={section}>
          <p className="text-xs text-sam-muted">
            {ownerUiCopy(language, "이번 달 (필리핀 시간 기준)", "This month (Philippine time)")}
          </p>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">{ownerUiCopy(language, "수수료 부과 건수", "Charged orders")}</dt>
              <dd className="font-semibold">{commissionMonth?.summary.count ?? "—"}</dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">{ownerUiCopy(language, "수수료 기준 매출", "Commission base")}</dt>
              <dd className="font-semibold">
                {commissionMonth
                  ? formatFinanceAmount({ wallet: "CASH", amount: commissionMonth.summary.commissionBasePhp * 100, isMinor: true })
                  : "—"}
              </dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">{ownerUiCopy(language, "순수수료", "Net commission")}</dt>
              <dd className="font-semibold">
                {commissionMonth
                  ? formatFinanceAmount({ wallet: "CASH", amount: commissionMonth.summary.netCommissionMinor, isMinor: true })
                  : "—"}
              </dd>
            </div>
            {/* IA-13 — 「지급 의무」는 플랫폼 보유분(선물·플랫폼 쿠폰)만. 주문 대금 지급 개념 없음(SSOT). */}
            {commissionMonth?.payable && commissionMonth.payable.payablePhp > 0 ? (
              <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
                <dt className="text-xs text-sam-muted">
                  {ownerUiCopy(language, "플랫폼 보유분 지급 의무 (선물·쿠폰)", "Platform-held payable (gift/coupon)")}
                </dt>
                <dd className="font-semibold">
                  {formatFinanceAmount({ wallet: "CASH", amount: commissionMonth.payable.payablePhp * 100, isMinor: true })}
                </dd>
              </div>
            ) : null}
          </dl>
          <Link href={settlementsHref} className={`${OwnerCta.primary} ${OwnerCta.block} sm:w-auto`}>
            {ownerUiCopy(language, "수수료·캐시 원장 열기", "Open commission & Cash ledger")}
          </Link>
          <p className="text-xs text-sam-muted">
            {ownerUiCopy(
              language,
              "주문 대금은 고객에게 직접 받습니다. 주문별 수수료·환급 내역은 원장에서 확인합니다.",
              "You collect order payments directly. Per-order commission and refunds are in the ledger."
            )}
          </p>
        </section>
      ) : null}

      {section === "outstanding" ? (
        <section className="space-y-3" data-owner-finance-section="outstanding">
          <p className="text-sm font-semibold">
            {formatFinanceAmount({
              wallet: "CASH",
              amount: saleFeeOutstandingMinor,
              isMinor: true,
            })}{" "}
            {ownerUiCopy(language, "미납", "outstanding")}
          </p>
          {obligationRows.length === 0 ? (
            <p className="text-sm text-sam-muted">{ownerUiCopy(language, "미납 판매 수수료 없음.", "No outstanding sale fees.")}</p>
          ) : (
            <ul className="space-y-2">
              {obligationRows.map((r) => (
                <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm">
                  <Link
                    href={`${settlementsHref}${settlementsHref.includes("?") ? "&" : "?"}${new URLSearchParams({
                      order_no: r.orderNo || "",
                      open: r.id,
                    }).toString()}`}
                    className="font-semibold text-signature hover:underline"
                  >
                    {ownerUiCopy(language, "수수료 상세", "Fee detail")} · {r.orderNo || `${r.orderId.slice(0, 8)}…`}
                  </Link>
                  <p className="mt-1 tabular-nums text-sam-muted">
                    {formatFinanceAmount({ wallet: "CASH", amount: r.feeOutstandingMinor, isMinor: true })}{" "}
                    / {formatFinanceAmount({ wallet: "CASH", amount: r.feeDueMinor, isMinor: true })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {section === "coin" ? (
        <section className="space-y-3" data-owner-finance-section="coin">
          <CurrencyBalanceCard currency="coin" amount={coinBalance} />
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-owner-finance-coin-recent-window={recentN}>
            <div className="rounded-ui-rect border border-sam-border px-3 py-2">
              <dt className="text-xs text-sam-muted">{recentLabel("적립", "Earned")}</dt>
              <dd className="font-semibold">{recentValue(coinRecentWindow?.earned)}</dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border px-3 py-2">
              <dt className="text-xs text-sam-muted">{recentLabel("전환", "Converted")}</dt>
              <dd className="font-semibold">{recentValue(coinRecentWindow?.converted)}</dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border px-3 py-2">
              <dt className="text-xs text-sam-muted">{recentLabel("Coin 환전", "Cashed out")}</dt>
              <dd className="font-semibold">{recentValue(coinRecentWindow?.withdrawn)}</dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border px-3 py-2">
              <dt className="text-xs text-sam-muted">{recentLabel("반전", "Reversed")}</dt>
              <dd className="font-semibold">{recentValue(coinRecentWindow?.reversed)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link href={convertHref} className={OwnerCta.primary} data-owner-finance-cta="convert">
              {ko ? COIN_TO_CASH_LABEL_KO : "Convert Coin to Cash"}
            </Link>
            <Link href={withdrawHref} className={OwnerCta.secondary} data-owner-finance-cta="withdraw">
              {ko ? COIN_WITHDRAWAL_LABEL_KO : "Request Coin withdrawal"}
            </Link>
          </div>
          <ul id="coin-history" className="space-y-2">
            {coinLedger.length === 0 ? (
              <li className="text-sm text-sam-muted">{t("store_owner_point_ledger_empty")}</li>
            ) : (
              coinLedger.slice(0, 40).map((row) => (
                <CurrencyHistoryRow
                  key={row.id}
                  currency="coin"
                  title={mapCoinLedgerTitle(language, row.entryKind)}
                  amount={Math.trunc(Number(row.amount) || 0)}
                  signed
                  createdAt={row.createdAt}
                  reference={ledgerReference(row)}
                />
              ))
            )}
          </ul>
        </section>
      ) : null}

      {section === "cash" || section === "ads" ? (
        <section className="space-y-3" data-owner-finance-section={section}>
          <CurrencyBalanceCard currency="cash" amount={cashBalanceMinor} isMinor />
          <ul id="cash-history" className="space-y-2">
            {(section === "ads"
              ? cashLedger.filter((r) => r.entryKind === "AD_SPEND" || r.entryKind === "AD_REFUND" || r.entryKind === "PARTNER_SPEND")
              : cashLedger
            ).length === 0 ? (
              <li className="text-sm text-sam-muted">
                {safeT("owner_finance_history_empty", {
                  fallbackKo: "거래가 없습니다.",
                  fallbackEn: "No transactions.",
                })}
              </li>
            ) : (
              (section === "ads"
                ? cashLedger.filter((r) =>
                    ["AD_SPEND", "AD_REFUND", "PARTNER_SPEND", "PARTNER_REFUND"].includes(r.entryKind)
                  )
                : cashLedger
              )
                .slice(0, 40)
                .map((row) => (
                  <CurrencyHistoryRow
                    key={row.id}
                    currency="cash"
                    title={mapCashLedgerTitle(language, row.entryKind)}
                    amount={signedCashMinor(row)}
                    isMinor
                    signed
                    createdAt={row.createdAt}
                    reference={ledgerReference(row)}
                  />
                ))
            )}
          </ul>
        </section>
      ) : null}

      {section === "convert" ? (
        <section className="space-y-3" data-owner-finance-section="convert">
          <div id="cash-manage">
            <OwnerBusinessCashView storeId={storeId} manageOnly onChanged={load} />
          </div>
        </section>
      ) : null}

      {section === "withdraw" ? (
        <section className="space-y-3" data-owner-finance-section="withdraw">
          <div id="coin-withdraw">
            <OwnerCoinWithdrawalPanel storeId={storeId} onSubmitted={load} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

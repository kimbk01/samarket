"use client";

import Link from "next/link";
import { readBalanceOrNull } from "@/lib/currency/currency-display-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRefetchOnNotificationArrival } from "@/lib/ui/use-refetch-on-notification-arrival";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyBalanceCard } from "@/components/currency";
import { OwnerWalletHistory } from "@/components/business/owner/OwnerWalletHistory";
import type { WalletHistoryRow } from "@/lib/finance/wallet-period-history";
import { OwnerBusinessCashView } from "@/components/business/owner/OwnerBusinessCashView";
import { OwnerCoinWithdrawalPanel } from "@/components/business/owner/OwnerCoinWithdrawalPanel";
import { OwnerFinanceNav } from "@/components/finance/OwnerFinanceNav";
import { OwnerFinanceStoreSwitcher } from "@/components/finance/OwnerFinanceStoreSwitcher";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import type {
  StoreCommissionLedgerSummary,
  StorePlatformPayableSummary,
} from "@/lib/stores/commission/load-store-commission-ledger";
import { buildStoreCommissionLedgerSearch, formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";
import {
  COIN_TO_CASH_LABEL_KO,
  COIN_WITHDRAWAL_LABEL_KO,
} from "@/lib/finance/product-decision-lock";
import { normalizeOwnerFinanceSection, ownerFinanceSectionHref } from "@/lib/finance/routes";
import { financeRelatedTypeLabel, formatFinanceAmount } from "@/lib/finance/presentation";

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

type FinancePayload = {
  assets?: {
    storePoints?: { balance?: number | null };
    businessCash?: { balanceMinor?: number | null };
  };
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

function mapCoinLedgerTitle(t: (key: MessageKey) => string, kind: string): string {
  switch (kind) {
    case "SALE_EARN":
      return t("owner_copy_finance_coin_ledger_sale_earn");
    case "REVERSAL":
      return t("owner_copy_finance_coin_ledger_reversal");
    case "GIFT_REDEMPTION_EARN":
      return t("owner_copy_finance_coin_ledger_gift_redemption_earn");
    case "CONVERT_TO_BUSINESS_CASH":
      return t("owner_copy_finance_coin_ledger_convert_to_cash");
    case "WITHDRAWAL_REQUEST":
      return t("owner_copy_finance_coin_ledger_withdrawal_request");
    case "WITHDRAWAL_RELEASE":
    case "WITHDRAWAL_REJECT":
      return t("owner_copy_finance_coin_ledger_withdrawal_release");
    case "WITHDRAWAL_COMPLETE":
      return t("owner_copy_finance_coin_ledger_withdrawal_complete");
    case "ADMIN_ADJUST":
      return t("owner_copy_finance_ledger_admin_adjust");
    case "ECONOMIC_INFLOW":
      return t("owner_copy_finance_coin_ledger_economic_inflow");
    default:
      return t("owner_copy_finance_coin_ledger_default");
  }
}

function mapCashLedgerTitle(t: (key: MessageKey) => string, kind: string): string {
  switch (kind) {
    case "TOP_UP":
      return t("owner_copy_finance_cash_ledger_top_up");
    case "CONVERT_FROM_STORE_POINTS":
      return t("owner_copy_finance_cash_ledger_convert_from_coin");
    case "AD_SPEND":
      return t("owner_copy_finance_cash_ledger_ad_spend");
    case "AD_REFUND":
      return t("owner_copy_finance_cash_ledger_ad_refund");
    case "PARTNER_SPEND":
      return t("owner_copy_finance_cash_ledger_partner_spend");
    case "PARTNER_REFUND":
      return t("owner_copy_finance_cash_ledger_partner_refund");
    case "SALE_FEE":
      return t("owner_copy_finance_cash_ledger_sale_fee");
    case "SALE_FEE_SETTLEMENT":
      return t("owner_copy_finance_cash_ledger_sale_fee_settlement");
    case "SALE_FEE_REVERSAL":
      return t("owner_copy_finance_cash_ledger_sale_fee_reversal");
    case "ADMIN_ADJUST":
      return t("owner_copy_finance_ledger_admin_adjust");
    default:
      return t("owner_copy_finance_cash_ledger_default");
  }
}


/** P1 — 원천 거래 표시: 사람이 읽는 이름 · 짧은 ID (원시 테이블명 노출 금지). null when absent. */
function ledgerReference(
  row: LedgerRow,
  language: "ko" | "en",
  t: (key: MessageKey) => string
): string | null {
  const type = String(row.relatedType ?? "").trim();
  const id = String(row.relatedId ?? "").trim();
  if (!type && !id) return null;
  // 이름표 = 관리자와 같은 공용 표 (lib/finance/presentation RELATED_TYPE_LABELS)
  const name = financeRelatedTypeLabel(type, language !== "en") ?? t("owner_copy_finance_ledger_related");
  const shortId = id.length > 12 ? `${id.slice(0, 8)}…` : id;
  return [name, shortId].filter(Boolean).join(" · ");
}


/**
 * Owner Finance — same read-model story as Admin, owner-scoped section shell.
 */
export function OwnerStoreFinanceView({ storeId }: { storeId: string }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = normalizeOwnerFinanceSection(searchParams.get("section"));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [cashBalanceMinor, setCashBalanceMinor] = useState<number | null>(null);
  const [saleFeeOutstandingMinor, setSaleFeeOutstandingMinor] = useState(0);
  const [obligationRows, setObligationRows] = useState<
    NonNullable<NonNullable<FinancePayload["saleFeeObligations"]>["rows"]>
  >([]);
  /** 잔액을 다시 읽을 때 기간 내역도 같이 다시 읽는 신호 */
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  /** This month (Asia/Manila) — same SQL readers as the settlement screen (commission SSOT). */
  const [commissionMonth, setCommissionMonth] = useState<{
    summary: StoreCommissionLedgerSummary;
    payable: StorePlatformPayableSummary | null;
  } | null>(null);

  const settlementsHref = OwnerRoutes.settlements(storeId);
  const convertHref = ownerFinanceSectionHref(storeId, "convert");
  const withdrawHref = ownerFinanceSectionHref(storeId, "withdraw");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    // silent = 작업 후·복귀·탭 이동 재조회 — 화면을 비우지 않아 완료 안내·스크롤이 유지된다
    // (실기 FAIL 2026-11-03: 전환 후 「불러오는 중」 으로 전체가 바뀌어 안내가 사라지고 맨 위로 이동,
    //  관리자 반려 뒤 출금 내역은 갱신되는데 「출금 가능 Coin」 은 0 으로 남음).
    if (!opts?.silent) setLoading(true);
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
      setCoinBalance(readBalanceOrNull(json.assets?.storePoints?.balance));
      setCashBalanceMinor(readBalanceOrNull(json.assets?.businessCash?.balanceMinor));
      setSaleFeeOutstandingMinor(Math.trunc(Number(json.saleFeeObligations?.outstandingMinor) || 0));
      setObligationRows(json.saleFeeObligations?.rows ?? []);
      if (opts?.silent) setHistoryReloadKey((k) => k + 1);

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

  const refetchSilently = useCallback(() => load({ silent: true }), [load]);
  useRefetchOnPageShowRestore(refetchSilently, { enableWindowFocusRefetch: true });
  // H-12 — 관리자 처리 알림 도착 → 잔액·기간 내역 갱신
  useRefetchOnNotificationArrival(refetchSilently);
  // 탭(section) 이동 때마다 잔액 재조회 — 다른 탭에서 바뀐 값·관리자 처리 결과 반영
  const firstSectionRef = useRef(true);
  useEffect(() => {
    if (firstSectionRef.current) {
      firstSectionRef.current = false;
      return;
    }
    void refetchSilently();
  }, [section, refetchSilently]);

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

  const lang2 = language === "en" ? "en" : "ko";
  const refFor = (row: WalletHistoryRow) => ledgerReference({ ...row, amount: row.signedAmount }, lang2, t);
  // 줄을 누르면 그 건으로 이동 (설계안 §2-4)
  const coinDetailHref = (row: WalletHistoryRow): string | undefined =>
    row.relatedType === "coin_withdrawal" || row.entryKind.startsWith("WITHDRAWAL_")
      ? withdrawHref
      : row.entryKind === "CONVERT_TO_BUSINESS_CASH"
        ? convertHref
        : undefined;
  const cashDetailHref = (row: WalletHistoryRow): string | undefined =>
    row.entryKind === "TOP_UP" || row.entryKind === "CONVERT_FROM_STORE_POINTS"
      ? convertHref
      : row.entryKind.startsWith("SALE_FEE")
        ? settlementsHref
        : undefined;

  if (loading) {
    return <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  }

  return (
    <div className="space-y-4 pb-8" data-owner-store-finance="1">
      {/* 제목은 전역 헤더(레지스트리) 1곳 — 본문 h1·개발자 설명 삭제 (OA-09·OA-10 · 2026-11-03) */}
      <OwnerFinanceStoreSwitcher storeId={storeId} section={section} ko={ko} />
      <OwnerFinanceNav storeId={storeId} ko={ko} />

      {error ? <p className="text-sm text-sam-danger">{error}</p> : null}

      {section === "transactions" ? (
        <section className="space-y-3" data-owner-finance-section={section}>
          <p className="text-xs text-sam-muted">
            {t("owner_copy_finance_month_note")}
          </p>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">{t("owner_copy_finance_charged_orders")}</dt>
              <dd className="font-semibold">{commissionMonth?.summary.count ?? "—"}</dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">{t("owner_copy_finance_commission_base")}</dt>
              <dd className="font-semibold">
                {commissionMonth
                  ? formatFinanceAmount({ wallet: "CASH", amount: commissionMonth.summary.commissionBasePhp * 100, isMinor: true })
                  : "—"}
              </dd>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
              <dt className="text-xs text-sam-muted">{t("owner_copy_finance_net_commission")}</dt>
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
                  {t("owner_copy_finance_platform_payable")}
                </dt>
                <dd className="font-semibold">
                  {formatFinanceAmount({ wallet: "CASH", amount: commissionMonth.payable.payablePhp * 100, isMinor: true })}
                </dd>
              </div>
            ) : null}
          </dl>
          <Link href={settlementsHref} className={`${OwnerCta.primary} ${OwnerCta.block} sm:w-auto`}>
            {t("owner_copy_finance_open_ledger")}
          </Link>
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
            {t("owner_copy_finance_outstanding_suffix")}
          </p>
          {obligationRows.length === 0 ? (
            <p className="text-sm text-sam-muted">{t("owner_copy_finance_no_outstanding_fees")}</p>
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
                    {t("owner_copy_finance_fee_detail")} · {r.orderNo || `${r.orderId.slice(0, 8)}…`}
                  </Link>
                  <p className="mt-1 tabular-nums text-sam-muted">
                    {formatFinanceAmount({ wallet: "CASH", amount: r.feeOutstandingMinor, isMinor: true })}{" "}
                    / {formatFinanceAmount({ wallet: "CASH", amount: r.feeDueMinor, isMinor: true })}
                  </p>
                  <p className="mt-0.5 sam-text-xxs tabular-nums text-sam-muted">
                    {ko ? "부과" : "Charged"} {formatManilaDateTime(r.createdAt)} PHT
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
          <div className="flex flex-wrap gap-2">
            <Link href={convertHref} className={OwnerCta.primary} data-owner-finance-cta="convert">
              {ko ? COIN_TO_CASH_LABEL_KO : "Convert Coin to Cash"}
            </Link>
            <Link href={withdrawHref} className={OwnerCta.secondary} data-owner-finance-cta="withdraw">
              {ko ? COIN_WITHDRAWAL_LABEL_KO : "Request Coin withdrawal"}
            </Link>
          </div>
          <div id="coin-history">
            <OwnerWalletHistory
              storeId={storeId}
              wallet="coin"
              reloadKey={historyReloadKey}
              titleFor={(k) => mapCoinLedgerTitle(t, k)}
              referenceFor={refFor}
              detailHrefFor={coinDetailHref}
            />
          </div>
        </section>
      ) : null}

      {section === "cash" || section === "ads" ? (
        <section className="space-y-3" data-owner-finance-section={section}>
          <CurrencyBalanceCard currency="cash" amount={cashBalanceMinor} isMinor />
          {section === "cash" ? (
            <div className="flex flex-wrap gap-2">
              {/* P1 — Cash 허용 CTA = 충전 (CURRENCY_ALLOWED_ACTIONS.cash). 충전 폼은 전환 섹션 안에 있다. */}
              <Link href={convertHref} className={OwnerCta.primary} data-owner-finance-cta="cash-topup">
                {t("owner_copy_finance_cash_topup_cta")}
              </Link>
            </div>
          ) : null}
          <div id="cash-history">
            <OwnerWalletHistory
              key={section}
              storeId={storeId}
              wallet="cash"
              adsOnly={section === "ads"}
              reloadKey={historyReloadKey}
              titleFor={(k) => mapCashLedgerTitle(t, k)}
              referenceFor={refFor}
              detailHrefFor={cashDetailHref}
            />
          </div>
        </section>
      ) : null}

      {section === "convert" ? (
        <section className="space-y-3" data-owner-finance-section="convert">
          <div id="cash-manage">
            <OwnerBusinessCashView storeId={storeId} manageOnly onChanged={refetchSilently} />
          </div>
        </section>
      ) : null}

      {section === "withdraw" ? (
        <section className="space-y-3" data-owner-finance-section="withdraw">
          <div id="coin-withdraw">
            <OwnerCoinWithdrawalPanel storeId={storeId} availableCoin={coinBalance} onSubmitted={refetchSilently} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminStoreCashIntegritySection } from "@/components/admin/finance/AdminStoreCashIntegritySection";
import { AdminStoreBalanceCorrectionForm } from "@/components/admin/finance/AdminStoreBalanceCorrectionForm";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { FinanceFilterBar } from "@/components/finance/FinanceFilterBar";
import { FinanceTransactionList } from "@/components/finance/FinanceTransactionList";
import type { StoreStatement } from "@/lib/finance/store-statement/types";
import type { DailyStatementRow } from "@/lib/finance/daily-statement/types";
import type { FinanceUnifiedTx } from "@/lib/finance/unified-transaction/types";
import {
  financeCashHref,
  financeCoinHref,
  financeAdsHref,
  financeOutstandingHref,
  financeOrdersHref,
  financeStoreHref,
  financeDailyHref,
  parseFinanceFilters,
} from "@/lib/finance/routes";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import {
  formatStoreStatementPeriodLabel,
  statementInclusiveDays,
  storeStatementQueryParams,
} from "@/lib/admin/finance/store-detail-period";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { catalogPair } from "@/lib/i18n/catalog-pair";

type StoreListRow = {
  storeId: string;
  storeName: string;
  lastAt: string;
  sampleKinds: string[];
  periodKey?: string;
  gross: number | null;
  feeDue: number | null;
  coinEarned: number | null;
  cashClosingMinor: number | null;
};

/** 매장별 재무 집계 기간 — API(`resolveStoreFinancialPeriod`)가 받는 값만. */
const FINANCE_STORES_PERIODS = ["today", "7d", "30d"] as const;

/** 기간 이름 — 선택 상자와 같은 말 (D-10 · 내부 키 `30d` 를 화면에 내보내지 않는다). */
const FINANCE_STORES_PERIOD_LABEL: Record<(typeof FINANCE_STORES_PERIODS)[number], { ko: string; en: string }> = {
  today: catalogPair("finance_today"),
  "7d": catalogPair("finance_last_7_days"),
  "30d": catalogPair("finance_last_30_days"),
};

export function financeStoresPeriodLabel(periodKey: string, ko: boolean): string {
  const hit = (FINANCE_STORES_PERIOD_LABEL as Record<string, { ko: string; en: string } | undefined>)[periodKey];
  // 모르는 키는 다른 기간 이름으로 바꿔 보이지 않는다 (받은 값 그대로).
  if (!hit) return periodKey;
  return ko ? hit.ko : hit.en;
}

/**
 * Operational store index — period aggregates from StoreStatement (canonical).
 * R7 — 활동 매장 전체를 서버 페이지로 (주소 `page`·`size` → API `limit`/`offset`, 「전체 N곳」 = 서버 total).
 */
export function AdminFinanceStoresIndexView() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  /** 기간(`period` = today·7d·30d — API 가 받는 유일한 조건)을 주소에. 기본 30d. */
  const lq = useAdminListQuery<"period">({ extras: ["period"] });
  const periodParam = (FINANCE_STORES_PERIODS as readonly string[]).includes(lq.query.extras.period)
    ? lq.query.extras.period
    : "30d";
  const [storeId, setStoreId] = useState("");
  const [rows, setRows] = useState<StoreListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [periodKey, setPeriodKey] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 요청 번호 — 기간·쪽을 빨리 바꿀 때 늦게 온 이전 응답이 목록을 덮지 않게 (D-10). */
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        period: periodParam,
        limit: String(lq.query.size),
        offset: String((lq.query.page - 1) * lq.query.size),
      });
      const res = await fetch(`/api/admin/finance/stores-index?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        periodKey?: string;
        rows?: StoreListRow[];
        total?: number;
        error?: string;
      };
      if (seq !== loadSeqRef.current) return;
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setRows([]);
        setTotal(0);
        return;
      }
      const list = json.rows ?? [];
      setPeriodKey(json.periodKey || "30d");
      setRows(list);
      setTotal(typeof json.total === "number" ? json.total : list.length);
    } catch {
      if (seq !== loadSeqRef.current) return;
      setError("network_error");
      setRows([]);
      setTotal(0);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [periodParam, lq.query.page, lq.query.size]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-finance-stores-index="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-[16px] font-semibold text-sam-fg">{t("admin_finance_store_finance_3")}</h2>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_finance_stores_index_note", { period: financeStoresPeriodLabel(periodKey, ko) })}
      </p>

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        pending={loading}
        showPeriod={false}
        showSearch={false}
      >
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]">
          {t("admin_finance_period")}
          <select
            className="h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]"
            value={periodParam}
            onChange={(e) => lq.setExtra("period", e.target.value === "30d" ? "" : e.target.value)}
            data-finance-stores-filter-period="1"
          >
            <option value="today">{t("finance_today")}</option>
            <option value="7d">{t("finance_last_7_days")}</option>
            <option value="30d">{t("finance_last_30_days")}</option>
          </select>
        </label>
      </AdminFilterBar>

      {loading ? <AdminLoadingState ko={ko} /> : null}
      {error ? <AdminErrorState ko={ko} code={error} onRetry={() => void load()} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={
            lq.isFiltered ? undefined : t("admin_finance_no_stores_with_recent_finance_activity")
          }
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[52rem] text-left sam-text-body-secondary" data-finance-stores-ops-list="1">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("admin_biz_ops_th_store")}</th>
                <th className="px-3 py-2">{t("admin_finance_last_activity")}</th>
                <th className="px-3 py-2">{t("admin_finance_recent_kinds")}</th>
                <th className="px-3 py-2 text-right">{t("admin_finance_gross")}</th>
                <th className="px-3 py-2 text-right">{t("finance_fee")}</th>
                <th className="px-3 py-2 text-right">Coin</th>
                <th className="px-3 py-2 text-right">Cash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {rows.map((r) => (
                  <tr
                    key={r.storeId}
                    className="cursor-pointer hover:bg-sam-app"
                    onClick={() => router.push(financeStoreHref(r.storeId, { period: periodKey }))}
                    data-finance-store-row={r.storeId}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.storeName}</div>
                      <div className="font-mono sam-text-xxs text-sam-muted">{r.storeId}</div>
                    </td>
                    <td className="px-3 py-2 sam-text-xxs">
                      {r.lastAt ? formatAdminManilaDateTime(r.lastAt) : "—"}
                    </td>
                    <td className="px-3 py-2 sam-text-xxs text-sam-muted">{r.sampleKinds.join(" · ")}</td>
                    <td className="px-3 py-2 text-right tabular-nums" data-finance-store-agg="gross">
                      {r.gross == null ? "—" : formatAdminPhp(r.gross)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" data-finance-store-agg="fee">
                      {r.feeDue == null ? "—" : formatFinanceAmount({ wallet: "CASH", amount: r.feeDue })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" data-finance-store-agg="coin">
                      {r.coinEarned == null
                        ? "—"
                        : formatFinanceAmount({ wallet: "COIN", amount: r.coinEarned })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" data-finance-store-agg="cash">
                      {r.cashClosingMinor == null
                        ? "—"
                        : formatFinanceAmount({
                            wallet: "CASH",
                            amount: r.cashClosingMinor,
                            isMinor: true,
                          })}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && !error && total > 0 ? (
        <AdminPagination
          ko={ko}
          page={lq.query.page}
          size={lq.query.size}
          total={total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={loading}
        />
      ) : null}

      <details className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
        <summary className="cursor-pointer sam-text-body-secondary text-sam-muted">
          {t("admin_finance_open_by_store_id_exception")}
        </summary>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            const sid = storeId.trim();
            if (!sid) return;
            router.push(financeStoreHref(sid));
          }}
        >
          <input
            className="min-w-[16rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            placeholder="Store ID"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            aria-label="Store ID lookup"
          />
          <AdminActionButton type="submit" variant="secondary">
            {adminCta("search", ko)}
          </AdminActionButton>
        </form>
      </details>
    </div>
  );
}

export function AdminFinanceStoreDetailView() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const params = useParams();
  const sp = useSearchParams();
  const storeId = decodeURIComponent(String(params?.storeId ?? "").trim());
  const filters = useMemo(() => parseFinanceFilters(new URLSearchParams(sp.toString())), [sp]);
  const [statement, setStatement] = useState<StoreStatement | null>(null);
  const [daily, setDaily] = useState<DailyStatementRow[]>([]);
  const [txRows, setTxRows] = useState<FinanceUnifiedTx[]>([]);
  /** H-9 (Owner 2026-11-03): 거래 목록 80줄 고정 → 서버 페이지(주소 `page`·`size` 20/50/100 · 「전체 N건」 = 서버 total). */
  const txLq = useAdminListQuery();
  const txPage = txLq.query.page;
  const txSize = txLq.query.size;
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * R4-d — 합계·일자별·목록이 같은 기간. 필터 from/to 가 있으면 합계도 그 기간(custom),
   * 목록은 합계 응답의 포함 기간을 그대로 쓴다 (statement.toIso 는 배타 끝 → 포함 끝 = 하루 전).
   */
  const statementQuery = useMemo(
    () => storeStatementQueryParams({ period: filters.period, from: filters.from, to: filters.to }),
    [filters.period, filters.from, filters.to]
  );
  const [periodDays, setPeriodDays] = useState<{ fromDay: string; toDay: string } | null>(null);
  /** R5-a — 늦게 온 이전 응답이 새 조건 결과를 덮어쓰지 않도록 요청 번호. */
  const loadSeqRef = useRef(0);
  const txSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!storeId) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    setPeriodDays(null);
    try {
      const qs = new URLSearchParams({ storeId, period: statementQuery.period });
      if (statementQuery.fromDay) qs.set("fromDay", statementQuery.fromDay);
      if (statementQuery.toDay) qs.set("toDay", statementQuery.toDay);
      const [stRes, dayRes] = await Promise.all([
        fetch(`/api/admin/finance/store-statement?${qs}`, { credentials: "include", cache: "no-store" }),
        fetch(`/api/admin/finance/daily-statement?${qs}`, { credentials: "include", cache: "no-store" }),
      ]);
      const stJson = (await stRes.json().catch(() => ({}))) as {
        ok?: boolean;
        statement?: StoreStatement;
        period?: { fromDay?: string; toDay?: string };
        error?: string;
      };
      const dayJson = dayRes.ok
        ? ((await dayRes.json().catch(() => ({}))) as { ok?: boolean; rows?: DailyStatementRow[] })
        : null;
      if (seq !== loadSeqRef.current) return;
      if (!stRes.ok || !stJson.ok || !stJson.statement) {
        setError(stJson.error || "load_failed");
        setStatement(null);
        setPeriodDays(null);
      } else {
        setStatement(stJson.statement);
        setPeriodDays(
          statementInclusiveDays({
            period: stJson.period,
            fromIso: stJson.statement.fromIso,
            toIso: stJson.statement.toIso,
          })
        );
      }
      setDaily(dayJson?.rows ?? []);
    } catch {
      if (seq !== loadSeqRef.current) return;
      setError("network_error");
      setStatement(null);
      setPeriodDays(null);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [storeId, statementQuery]);

  const loadTx = useCallback(async () => {
    if (!storeId) return;
    const seq = ++txSeqRef.current;
    // 합계 기간이 정해지기 전에는 조회하지 않는다 (전체 기간 첫 조회 방지 · R5-a)
    if (!periodDays) {
      setTxRows([]);
      setTxTotal(0);
      setTxLoading(false);
      setTxError(null);
      return;
    }
    setTxLoading(true);
    setTxError(null);
    try {
      const qs = new URLSearchParams({
        storeId,
        limit: String(txSize),
        offset: String((txPage - 1) * txSize),
        from: periodDays.fromDay,
        to: periodDays.toDay,
      });
      if (filters.wallet) qs.set("wallet", filters.wallet);
      if (filters.type) qs.set("type", filters.type);
      const res = await fetch(`/api/admin/finance/transactions?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        transactions?: FinanceUnifiedTx[];
        total?: number;
        error?: string;
      };
      if (seq !== txSeqRef.current) return;
      if (!res.ok || !json.ok) {
        setTxError(json.error || "load_failed");
        setTxRows([]);
        setTxTotal(0);
        return;
      }
      const list = json.transactions ?? [];
      setTxRows(list);
      setTxTotal(typeof json.total === "number" ? json.total : list.length);
    } catch {
      if (seq !== txSeqRef.current) return;
      setTxError("network_error");
      setTxRows([]);
      setTxTotal(0);
    } finally {
      if (seq === txSeqRef.current) setTxLoading(false);
    }
  }, [storeId, filters.wallet, filters.type, txPage, txSize, periodDays]);

  /** 합계 기간을 기다리는 동안은 「불러오는 중」, 합계 실패로 기간을 모르면 목록도 오류로 표시. */
  const txListLoading = txLoading || (!periodDays && loading);
  const txListError = txError ?? (!periodDays && !loading && error ? "statement_period_unavailable" : null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadTx();
  }, [loadTx]);

  const f = { ...filters, storeId };
  const basePath = `/admin/finance/stores/${encodeURIComponent(storeId)}`;

  return (
    <div className="space-y-4" data-admin-finance-store-detail="1">
      <FinanceAdminNav ko={ko} />
      {loading ? <AdminLoadingState ko={ko} /> : null}
      {error ? <AdminErrorState ko={ko} code={error} onRetry={() => void load()} /> : null}
      {statement ? (
        <>
          <header>
            <h2 className="text-[16px] font-semibold text-sam-fg">{statement.storeName}</h2>
            <p className="sam-text-helper text-sam-muted font-mono">{statement.storeId}</p>
            <p className="sam-text-helper text-sam-muted" data-admin-finance-store-period="1">
              {t("admin_finance_period_2")}: {formatStoreStatementPeriodLabel(periodDays)}
            </p>
          </header>
          {statement.discrepancies.length > 0 ? (
            <p role="alert" className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-2 py-1 text-sam-fg">
              {t("admin_finance_discrepancy")}: {statement.discrepancies.join(", ")}
            </p>
          ) : null}
          <dl
            className="grid grid-cols-2 gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:grid-cols-3 lg:grid-cols-4"
            data-admin-finance-store-summary="1"
          >
            <div>
              <dt className="text-sam-muted">{t("admin_biz_ops_nav_orders")}</dt>
              <dd className="tabular-nums">{formatAdminNumber(statement.sales.orders)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_gross")}</dt>
              <dd>{formatAdminPhp(statement.sales.gross)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_fee_due_2")}</dt>
              <dd>{formatFinanceAmount({ wallet: "CASH", amount: statement.sales.settlementFee })}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_fee_paid_cash")}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.saleFeeMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("finance_outstanding")}</dt>
              <dd>{formatFinanceAmount({ wallet: "CASH", amount: statement.sales.outstanding })}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_outstanding_collected")}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.outstandingCollectionMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_coin_earned")}</dt>
              <dd>{formatFinanceAmount({ wallet: "COIN", amount: statement.coin.earned })}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_coin_balance")}</dt>
              <dd>{formatFinanceAmount({ wallet: "COIN", amount: statement.coin.closing })}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_cash_in_top_up")}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.topupMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_cash_in_conversion")}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.fromConversionMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_cash_balance")}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.closingMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_finance_ad_spend_refund")}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.adSpendMinor,
                  isMinor: true,
                })}{" "}
                /{" "}
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.refundMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link href={financeOrdersHref(f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {t("admin_finance_orders_2")}
            </Link>
            <Link href={financeAdsHref(f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {t("admin_finance_ad_spend_2")}
            </Link>
            <Link href={financeOutstandingHref(f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {t("admin_finance_outstanding_2")}
            </Link>
            <Link href={financeCoinHref(f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {t("admin_finance_coin_transactions")}
            </Link>
            <Link href={financeCashHref(f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {t("admin_finance_cash_transactions")}
            </Link>
            <Link href={financeDailyHref(storeId, f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {t("admin_finance_daily_statement")}
            </Link>
          </div>
          {daily.length > 0 ? (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
              <table className="w-full min-w-[48rem] text-left sam-text-body-secondary">
                <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
                  <tr>
                    <th className="px-3 py-2">{t("admin_finance_date_2")}</th>
                    <th className="px-3 py-2">{t("admin_biz_ops_nav_orders")}</th>
                    <th className="px-3 py-2">{t("admin_finance_gross")}</th>
                    <th className="px-3 py-2">{t("finance_fee")}</th>
                    <th className="px-3 py-2">Coin</th>
                    <th className="px-3 py-2">{t("admin_finance_ads")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sam-border-soft">
                  {daily.map((d) => (
                    <tr key={d.date}>
                      <td className="px-3 py-2">
                        <Link
                          href={financeCashHref({ ...f, from: d.date, to: d.date })}
                          className="font-semibold text-signature hover:underline"
                        >
                          {d.date}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{d.orders}</td>
                      <td className="px-3 py-2 tabular-nums">{formatAdminPhp(d.gross)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatFinanceAmount({ wallet: "CASH", amount: d.feeDue })}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatFinanceAmount({ wallet: "COIN", amount: d.coinEarned })}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatFinanceAmount({
                          wallet: "CASH",
                          amount: d.adSpendMinor,
                          isMinor: true,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}

      {storeId ? <AdminStoreCashIntegritySection storeId={storeId} ko={ko} /> : null}
      {/* 실기 FAIL 2026-11-03: 매장 Coin·Cash 수동 조정 양식이 연결되지 않은 화면에만 있어 관리자가 쓸 수 없었음 → 실제 화면에 연결
          (super_admin 정식 RPC · 사유·증빙 필수 · 원장 ADMIN_ADJUST + 감사 기록) */}
      {storeId ? (
        <AdminStoreBalanceCorrectionForm
          key={storeId}
          storeId={storeId}
          storeName={statement?.storeName || storeId}
          ko={ko}
          onDone={() => void load()}
        />
      ) : null}

      {storeId ? (
        <section className="space-y-2" data-admin-finance-store-tx-list="1">
          <h3 className="text-base font-semibold">
            {t("admin_finance_transactions_in_period")}
            {periodDays ? (
              <span className="ml-2 sam-text-helper font-normal text-sam-muted">
                {formatStoreStatementPeriodLabel(periodDays)}
              </span>
            ) : null}
          </h3>
          <FinanceFilterBar ko={ko} basePath={basePath} />
          <FinanceTransactionList
            ko={ko}
            rows={txRows}
            filters={f}
            loading={txListLoading}
            error={txListError}
            onRetry={() => void (periodDays ? loadTx() : load())}
            emptyFiltered={Boolean(filters.wallet || filters.type || filters.from || filters.to)}
          />
          {!txListLoading && !txListError && txTotal > 0 ? (
            <AdminPagination
              ko={ko}
              page={txPage}
              size={txSize}
              total={txTotal}
              onPageChange={txLq.setPage}
              onSizeChange={txLq.setSize}
              disabled={txListLoading}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

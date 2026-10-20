"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";

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

/**
 * Operational store index — period aggregates from StoreStatement (canonical).
 * R7 — 활동 매장 전체를 서버 페이지로 (주소 `page`·`size` → API `limit`/`offset`, 「전체 N곳」 = 서버 total).
 */
export function AdminFinanceStoresIndexView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const lq = useAdminListQuery();
  const [storeId, setStoreId] = useState("");
  const [rows, setRows] = useState<StoreListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [periodKey, setPeriodKey] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        period: "30d",
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
      setError("network_error");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [lq.query.page, lq.query.size]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-finance-stores-index="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-[16px] font-semibold text-sam-fg">{ko ? "매장별 재무" : "Store finance"}</h2>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? `최근 재무 활동 매장 · 기간 ${periodKey} 집계는 Store Statement와 동일 canonical 소스입니다.`
          : `Stores with recent finance activity. Period ${periodKey} aggregates use the same StoreStatement source.`}
      </p>

      {loading ? <AdminLoadingState ko={ko} /> : null}
      {error ? <AdminErrorState ko={ko} code={error} onRetry={() => void load()} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={ko ? "최근 거래가 있는 매장이 없습니다." : "No stores with recent finance activity."}
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[52rem] text-left sam-text-body-secondary" data-finance-stores-ops-list="1">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">{ko ? "매장" : "Store"}</th>
                <th className="px-3 py-2">{ko ? "최근 거래" : "Last activity"}</th>
                <th className="px-3 py-2">{ko ? "최근 유형" : "Recent kinds"}</th>
                <th className="px-3 py-2 text-right">Gross</th>
                <th className="px-3 py-2 text-right">{ko ? "수수료" : "Fee"}</th>
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
                      {r.feeDue == null ? "—" : formatAdminPhp(r.feeDue)}
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
          {ko ? "Store ID로 직접 열기 (예외)" : "Open by Store ID (exception)"}
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
  const { language } = useI18n();
  const ko = language !== "en";
  const params = useParams();
  const sp = useSearchParams();
  const storeId = decodeURIComponent(String(params?.storeId ?? "").trim());
  const filters = useMemo(() => parseFinanceFilters(new URLSearchParams(sp.toString())), [sp]);
  const [statement, setStatement] = useState<StoreStatement | null>(null);
  const [daily, setDaily] = useState<DailyStatementRow[]>([]);
  const [txRows, setTxRows] = useState<FinanceUnifiedTx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const period = filters.period || "30d";

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const [stRes, dayRes] = await Promise.all([
        fetch(
          `/api/admin/finance/store-statement?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}`,
          { credentials: "include", cache: "no-store" }
        ),
        fetch(
          `/api/admin/finance/daily-statement?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}`,
          { credentials: "include", cache: "no-store" }
        ),
      ]);
      const stJson = (await stRes.json()) as {
        ok?: boolean;
        statement?: StoreStatement;
        error?: string;
      };
      if (!stRes.ok || !stJson.ok || !stJson.statement) {
        setError(stJson.error || "load_failed");
        setStatement(null);
      } else {
        setStatement(stJson.statement);
      }
      if (dayRes.ok) {
        const dayJson = (await dayRes.json()) as { ok?: boolean; rows?: DailyStatementRow[] };
        setDaily(dayJson.rows ?? []);
      } else {
        setDaily([]);
      }
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [storeId, period]);

  const loadTx = useCallback(async () => {
    if (!storeId) return;
    setTxLoading(true);
    setTxError(null);
    try {
      const qs = new URLSearchParams({
        storeId,
        limit: "80",
      });
      if (filters.from) qs.set("from", filters.from);
      if (filters.to) qs.set("to", filters.to);
      if (filters.wallet) qs.set("wallet", filters.wallet);
      if (filters.type) qs.set("type", filters.type);
      const res = await fetch(`/api/admin/finance/transactions?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        transactions?: FinanceUnifiedTx[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setTxError(json.error || "load_failed");
        setTxRows([]);
        return;
      }
      setTxRows(json.transactions ?? []);
    } catch {
      setTxError("network_error");
      setTxRows([]);
    } finally {
      setTxLoading(false);
    }
  }, [storeId, filters.from, filters.to, filters.wallet, filters.type]);

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
            <p className="sam-text-helper text-sam-muted">
              {ko ? "기간" : "Period"}: {period}
            </p>
          </header>
          {statement.discrepancies.length > 0 ? (
            <p role="alert" className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-2 py-1 text-sam-fg">
              {ko ? "불일치 확인 필요" : "Discrepancy"}: {statement.discrepancies.join(", ")}
            </p>
          ) : null}
          <dl
            className="grid grid-cols-2 gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:grid-cols-3 lg:grid-cols-4"
            data-admin-finance-store-summary="1"
          >
            <div>
              <dt className="text-sam-muted">{ko ? "주문" : "Orders"}</dt>
              <dd className="tabular-nums">{formatAdminNumber(statement.sales.orders)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">Gross</dt>
              <dd>{formatAdminPhp(statement.sales.gross)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "수수료 Due" : "Fee due"}</dt>
              <dd>{formatAdminPhp(statement.sales.settlementFee)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "수수료 Paid (Cash)" : "Fee paid (Cash)"}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.saleFeeMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "미납" : "Outstanding"}</dt>
              <dd>{formatAdminPhp(statement.sales.outstanding)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "미납 회수" : "Outstanding collected"}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.outstandingCollectionMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "Coin 적립" : "Coin earned"}</dt>
              <dd>{formatFinanceAmount({ wallet: "COIN", amount: statement.coin.earned })}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "Coin 잔액" : "Coin balance"}</dt>
              <dd>{formatFinanceAmount({ wallet: "COIN", amount: statement.coin.closing })}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "Cash 유입 (충전)" : "Cash in (top-up)"}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.topupMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "Cash 유입 (전환)" : "Cash in (conversion)"}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.fromConversionMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "Cash 잔액" : "Cash balance"}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.closingMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "광고 지출 / 환불" : "Ad spend / refund"}</dt>
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
              {ko ? "주문별 보기" : "Orders"}
            </Link>
            <Link href={financeAdsHref(f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {ko ? "광고 지출 보기" : "Ad spend"}
            </Link>
            <Link href={financeOutstandingHref(f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {ko ? "미납 보기" : "Outstanding"}
            </Link>
            <Link href={financeCoinHref(f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {ko ? "Coin 거래 보기" : "Coin transactions"}
            </Link>
            <Link href={financeCashHref(f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {ko ? "Cash 거래 보기" : "Cash transactions"}
            </Link>
            <Link href={financeDailyHref(storeId, f)} className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold">
              {ko ? "일자별 보기" : "Daily statement"}
            </Link>
          </div>
          {daily.length > 0 ? (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
              <table className="w-full min-w-[48rem] text-left sam-text-body-secondary">
                <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
                  <tr>
                    <th className="px-3 py-2">{ko ? "날짜" : "Date"}</th>
                    <th className="px-3 py-2">Orders</th>
                    <th className="px-3 py-2">Gross</th>
                    <th className="px-3 py-2">{ko ? "수수료" : "Fee"}</th>
                    <th className="px-3 py-2">Coin</th>
                    <th className="px-3 py-2">{ko ? "광고" : "Ads"}</th>
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
                      <td className="px-3 py-2 tabular-nums">{formatAdminPhp(d.feeDue)}</td>
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

      {storeId ? (
        <section className="space-y-2" data-admin-finance-store-tx-list="1">
          <h3 className="text-base font-semibold">
            {ko ? "기간 내 거래" : "Transactions in period"}
          </h3>
          <FinanceFilterBar ko={ko} basePath={basePath} />
          <FinanceTransactionList
            ko={ko}
            rows={txRows}
            filters={f}
            loading={txLoading}
            error={txError}
            onRetry={() => void loadTx()}
            emptyFiltered={Boolean(filters.wallet || filters.type || filters.from || filters.to)}
          />
        </section>
      ) : null}
    </div>
  );
}

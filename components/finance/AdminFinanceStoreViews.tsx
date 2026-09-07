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
import { formatMoneyPhp } from "@/lib/utils/format";

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

/** Operational store index — period aggregates from StoreStatement (canonical). */
export function AdminFinanceStoresIndexView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const [storeId, setStoreId] = useState("");
  const [rows, setRows] = useState<StoreListRow[]>([]);
  const [periodKey, setPeriodKey] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/stores-index?period=30d&limit=24", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        periodKey?: string;
        rows?: StoreListRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setRows([]);
        return;
      }
      setPeriodKey(json.periodKey || "30d");
      setRows(json.rows ?? []);
    } catch {
      setError("network");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-finance-stores-index="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-lg font-semibold">{ko ? "매장별 재무" : "Store finance"}</h2>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? `최근 재무 활동 매장 · 기간 ${periodKey} 집계는 Store Statement와 동일 canonical 소스입니다.`
          : `Stores with recent finance activity. Period ${periodKey} aggregates use the same StoreStatement source.`}
      </p>

      {loading ? <p className="text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p> : null}
      {error ? (
        <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2">
          <p>{ko ? "최근 매장 목록을 불러오지 못했습니다." : "Could not load recent stores."}</p>
          <button type="button" className="mt-2 font-semibold text-signature" onClick={() => void load()}>
            {ko ? "다시 시도" : "Retry"}
          </button>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[52rem] text-left sam-text-body-secondary" data-finance-stores-ops-list="1">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">{ko ? "매장" : "Store"}</th>
                <th className="px-3 py-2">{ko ? "최근 거래" : "Last activity"}</th>
                <th className="px-3 py-2">{ko ? "최근 유형" : "Recent kinds"}</th>
                <th className="px-3 py-2">Gross</th>
                <th className="px-3 py-2">{ko ? "수수료" : "Fee"}</th>
                <th className="px-3 py-2">Coin</th>
                <th className="px-3 py-2">Cash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sam-muted">
                    {ko ? "최근 거래가 있는 매장이 없습니다." : "No stores with recent finance activity."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
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
                      {r.lastAt ? new Date(r.lastAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 sam-text-xxs text-sam-muted">{r.sampleKinds.join(" · ")}</td>
                    <td className="px-3 py-2 tabular-nums" data-finance-store-agg="gross">
                      {r.gross == null ? "—" : formatMoneyPhp(r.gross)}
                    </td>
                    <td className="px-3 py-2 tabular-nums" data-finance-store-agg="fee">
                      {r.feeDue == null ? "—" : formatMoneyPhp(r.feeDue)}
                    </td>
                    <td className="px-3 py-2 tabular-nums" data-finance-store-agg="coin">
                      {r.coinEarned == null
                        ? "—"
                        : formatFinanceAmount({ wallet: "COIN", amount: r.coinEarned })}
                    </td>
                    <td className="px-3 py-2 tabular-nums" data-finance-store-agg="cash">
                      {r.cashClosingMinor == null
                        ? "—"
                        : formatFinanceAmount({
                            wallet: "CASH",
                            amount: r.cashClosingMinor,
                            isMinor: true,
                          })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
          <button type="submit" className="rounded-ui-rect border border-sam-border px-4 py-2 font-semibold">
            {ko ? "열기" : "Open"}
          </button>
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
      setError("network");
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
      const json = (await res.json()) as {
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
      setTxError("network");
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
      {loading ? <p className="text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p> : null}
      {error ? (
        <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2">
          <p>{ko ? "매장 재무를 불러오지 못했습니다." : "Could not load store finance."}</p>
          <button type="button" className="mt-2 font-semibold text-signature" onClick={() => void load()}>
            {ko ? "다시 시도" : "Retry"}
          </button>
        </div>
      ) : null}
      {statement ? (
        <>
          <header>
            <h2 className="text-lg font-semibold">{statement.storeName}</h2>
            <p className="sam-text-helper text-sam-muted font-mono">{statement.storeId}</p>
            <p className="sam-text-helper text-sam-muted">
              {ko ? "기간" : "Period"}: {period}
            </p>
          </header>
          {statement.discrepancies.length > 0 ? (
            <p className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-amber-950">
              discrepancy: {statement.discrepancies.join(", ")}
            </p>
          ) : null}
          <dl
            className="grid grid-cols-2 gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:grid-cols-3 lg:grid-cols-4"
            data-admin-finance-store-summary="1"
          >
            <div>
              <dt className="text-sam-muted">{ko ? "주문" : "Orders"}</dt>
              <dd>{statement.sales.orders}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">Gross</dt>
              <dd>{formatMoneyPhp(statement.sales.gross)}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "수수료 Due" : "Fee due"}</dt>
              <dd>{formatMoneyPhp(statement.sales.settlementFee)}</dd>
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
              <dd>{formatMoneyPhp(statement.sales.outstanding)}</dd>
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
                      <td className="px-3 py-2 tabular-nums">{formatMoneyPhp(d.gross)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatMoneyPhp(d.feeDue)}</td>
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

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import type { StoreStatement } from "@/lib/finance/store-statement/types";
import type { DailyStatementRow } from "@/lib/finance/daily-statement/types";
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

export function AdminFinanceStoresIndexView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const [storeId, setStoreId] = useState("");

  return (
    <div className="space-y-4" data-admin-finance-stores-index="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-lg font-semibold">{ko ? "매장별 재무" : "Store finance"}</h2>
      <form
        className="flex flex-wrap gap-2"
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
        />
        <button type="submit" className="rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white">
          {ko ? "매장 재무 열기" : "Open store finance"}
        </button>
      </form>
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const [stRes, dayRes] = await Promise.all([
        fetch(
          `/api/admin/finance/store-statement?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(filters.period || "30d")}`,
          { credentials: "include", cache: "no-store" }
        ),
        fetch(
          `/api/admin/finance/daily-statement?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(filters.period || "30d")}`,
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
  }, [storeId, filters.period]);

  useEffect(() => {
    void load();
  }, [load]);

  const f = { ...filters, storeId };

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
          </header>
          {statement.discrepancies.length > 0 ? (
            <p className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-amber-950">
              discrepancy: {statement.discrepancies.join(", ")}
            </p>
          ) : null}
          <dl className="grid grid-cols-2 gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:grid-cols-3">
            <div>
              <dt className="text-sam-muted">{ko ? "판매" : "Sales"}</dt>
              <dd>
                {statement.sales.orders} · {formatMoneyPhp(statement.sales.gross)}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "수수료 / 미납" : "Fee / outstanding"}</dt>
              <dd>
                {formatMoneyPhp(statement.sales.settlementFee)} / {formatMoneyPhp(statement.sales.outstanding)}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">Coin</dt>
              <dd>
                {formatFinanceAmount({ wallet: "COIN", amount: statement.coin.opening })} →{" "}
                {formatFinanceAmount({ wallet: "COIN", amount: statement.coin.closing })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">Cash</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.openingMinor,
                  isMinor: true,
                })}{" "}
                →{" "}
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.closingMinor,
                  isMinor: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "광고 지출" : "Ad spend"}</dt>
              <dd>
                {formatFinanceAmount({
                  wallet: "CASH",
                  amount: statement.cash.adSpendMinor,
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
    </div>
  );
}

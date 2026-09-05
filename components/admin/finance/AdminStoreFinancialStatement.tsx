"use client";

/**
 * ARO-OPS-UX-002-B3 — Store Financial Statement workspace (read-only).
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoreFinancialStatementModel } from "@/lib/admin/store-financial-statement/types";

function php(n: number | null | undefined): string {
  if (n == null) return "UNAVAILABLE";
  return `₱${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function cashMinor(n: number | null | undefined): string {
  if (n == null) return "UNAVAILABLE";
  return php(Math.trunc(n) / 100);
}

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="space-y-2" data-admin-store-statement-section={testId}>
      <h2 className="sam-text-body font-semibold text-sam-fg">{title}</h2>
      {children}
    </section>
  );
}

function Unavail({ ko }: { ko: boolean }) {
  return (
    <span className="rounded-ui-rect border border-amber-600 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900">
      {ko ? "확인 불가" : "UNAVAILABLE"}
    </span>
  );
}

export function AdminStoreFinancialStatement({
  storeId: storeIdProp,
  initialPeriod = "30d",
}: {
  storeId: string;
  initialPeriod?: string;
}) {
  const { language } = useI18n();
  const ko = language !== "en";
  const [period, setPeriod] = useState(initialPeriod);
  const [model, setModel] = useState<StoreFinancialStatementModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const sid = storeIdProp.trim();
    if (!sid) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/store-financial-statement?storeId=${encodeURIComponent(sid)}&period=${encodeURIComponent(period)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        statement?: StoreFinancialStatementModel;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.statement) {
        setModel(null);
        setError(json.error || "load_failed");
        return;
      }
      setModel(json.statement);
    } catch {
      setModel(null);
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [storeIdProp, period]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !model) {
    return (
      <p className="sam-text-body text-sam-muted" data-admin-store-financial-statement="loading">
        {ko ? "재무 명세서를 불러오는 중…" : "Loading financial statement…"}
      </p>
    );
  }

  if (error && !model) {
    return (
      <p className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950" data-admin-store-financial-statement="error">
        {ko ? "재무 명세서를 불러오지 못했습니다." : "Could not load financial statement."} ({error})
      </p>
    );
  }

  if (!model) return null;
  const s = model;

  return (
    <div className="space-y-5" data-admin-store-financial-statement="1" data-aro-ops-ux-002-b3="1">
      <header className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-sam-fg">
              {ko ? "매장 재무 명세서" : "Store financial statement"}
            </h1>
            <p className="mt-1 sam-text-body text-sam-fg">{s.store.name}</p>
            <p className="sam-text-helper text-sam-muted">
              ID {s.store.id}
              {s.store.ownerLabel ? ` · ${s.store.ownerLabel}` : ""}
              {s.store.status ? ` · ${s.store.status}` : ""}
              {s.store.region ? ` · ${s.store.region}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", ko ? "오늘" : "Today"],
                ["7d", "7D"],
                ["30d", "30D"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                className={`rounded border px-2.5 py-1.5 sam-text-helper font-medium ${
                  period === k
                    ? "border-signature bg-signature/10 text-signature"
                    : "border-sam-border bg-sam-app text-sam-fg"
                }`}
                data-admin-statement-period={k}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void load()}
              className="rounded border border-sam-border bg-sam-app px-2.5 py-1.5 sam-text-helper font-medium text-sam-fg"
            >
              {ko ? "새로고침" : "Refresh"}
            </button>
          </div>
        </div>
        <nav className="flex flex-wrap gap-3 sam-text-body-secondary">
          <Link href={s.links.business} className="text-signature hover:underline">
            {ko ? "매장 상세" : "Store"}
          </Link>
          <Link href={s.links.orders} className="text-signature hover:underline">
            {ko ? "주문" : "Orders"}
          </Link>
          <Link href={s.links.settlements} className="text-signature hover:underline">
            {ko ? "정산" : "Settlements"}
          </Link>
          <Link href={s.links.ads} className="text-signature hover:underline">
            Ads
          </Link>
          <Link href={s.links.cashCharges} className="text-signature hover:underline">
            Cash
          </Link>
          <Link href={s.links.support} className="text-signature hover:underline">
            Support
          </Link>
        </nav>
        {s.sectionErrors.length > 0 ? (
          <p className="sam-text-helper text-amber-800" data-admin-statement-section-errors="1">
            {ko ? "일부 소스 확인 불가" : "Some sources unavailable"}: {s.sectionErrors.join(" · ")}
          </p>
        ) : null}
      </header>

      <Section title={ko ? "요약 (한눈에)" : "Summary"} testId="summary">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              id: "sales",
              label: ko ? "기간 판매" : "Period sales",
              value: php(s.summary.periodSales.amount),
              hint: s.summary.periodSales.source,
            },
            {
              id: "fee",
              label: ko ? "기간 수수료" : "Period fee",
              value: php(s.summary.periodFee.amount),
              hint: s.summary.periodFee.source,
            },
            {
              id: "coin",
              label: ko ? "현재 Coin" : "Coin (now)",
              value: s.summary.coinBalance.amount == null ? "UNAVAILABLE" : String(s.summary.coinBalance.amount),
              hint: "point-in-time",
            },
            {
              id: "cash",
              label: ko ? "현재 Cash" : "Cash (now)",
              value: cashMinor(s.summary.cashBalanceMinor.amountMinor),
              hint: "point-in-time",
            },
            {
              id: "stl",
              label: ko ? "정산 대기" : "Settlement pending",
              value: php(s.summary.settlementPendingNet.amount),
              hint: s.summary.settlementPendingNet.source,
            },
            {
              id: "obl",
              label: ko ? "미납 판매수수료" : "Unpaid sale fee",
              value: cashMinor(s.summary.unpaidFeeObligationMinor.amountMinor),
              hint: s.summary.unpaidFeeObligationMinor.source,
            },
          ].map((c) => (
            <div
              key={c.id}
              className="min-h-[5.5rem] rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
              data-admin-statement-summary={c.id}
            >
              <p className="sam-text-helper text-sam-muted">{c.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-sam-fg">
                {c.value === "UNAVAILABLE" ? <Unavail ko={ko} /> : c.value}
              </p>
              <p className="mt-1 truncate sam-text-xxs text-sam-muted">{c.hint}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={ko ? "돈 흐름" : "Money flow"} testId="flow">
        <ol className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          {s.flow.map((step, idx) => (
            <li key={step.id} className="flex flex-wrap items-center gap-2 sam-text-body-secondary" data-admin-statement-flow={step.id}>
              <span className="text-sam-muted">{idx + 1}.</span>
              <span className="font-medium text-sam-fg">{ko ? step.labelKo : step.labelEn}</span>
              <span className="tabular-nums">
                {step.unavailable || step.amountLabel == null ? <Unavail ko={ko} /> : step.amountLabel}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={ko ? "판매" : "Sales"} testId="sales">
        {s.sales.unavailable ? (
          <Unavail ko={ko} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-body-secondary">
            <div>{ko ? "정산 인식 주문" : "Recognized orders"}: {s.sales.orderCount ?? "—"}</div>
            <div>{ko ? "완료" : "Completed"}: {s.sales.completedCount ?? "—"}</div>
            <div>{ko ? "취소" : "Cancelled"}: {s.sales.cancelledCount ?? "—"}</div>
            <div>{ko ? "총 판매" : "Gross"}: {php(s.sales.gross)}</div>
            <div>{ko ? "환불" : "Refund"}: {php(s.sales.refund)}</div>
          </div>
        )}
      </Section>

      <Section title={ko ? "수수료 (주문별 적용)" : "Fees (applied per order)"} testId="fees">
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[44rem] table-fixed text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">{ko ? "주문" : "Order"}</th>
                <th className="px-3 py-2">{ko ? "판매액" : "Sale"}</th>
                <th className="px-3 py-2">{ko ? "요율" : "Rate"}</th>
                <th className="px-3 py-2">{ko ? "수수료" : "Fee"}</th>
                <th className="px-3 py-2">{ko ? "고정" : "Fixed"}</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {s.fees.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sam-muted">
                    {s.fees.unavailable ? <Unavail ko={ko} /> : ko ? "기간 내 수수료 내역 없음" : "No fee rows in period"}
                  </td>
                </tr>
              ) : (
                s.fees.rows.map((r) => (
                  <tr key={r.settlementId}>
                    <td className="truncate px-3 py-2">
                      <Link href={r.orderHref} className="text-signature hover:underline">
                        {r.orderNo || r.orderId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{php(r.saleAmount)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.feeRatePercent == null ? "—" : `${r.feeRatePercent}%`}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{php(r.feeAmount)}</td>
                    <td className="px-3 py-2 tabular-nums">{php(r.fixedFeeAmount)}</td>
                    <td className="px-3 py-2">{r.settlementStatus}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={ko ? "미납 판매수수료 (Option B)" : "Unpaid sale fee (Option B)"} testId="obligations">
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? `미납 합계: ${cashMinor(s.obligations.outstandingMinor)} · Cash 부족 시 주문/Coin은 막지 않음 · 이후 충전/전환에서 상계`
            : `Outstanding: ${cashMinor(s.obligations.outstandingMinor)} · Orders/Coin not blocked on Cash shortage`}
        </p>
        <div className="mt-2 overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[40rem] text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">{ko ? "발생" : "Due"}</th>
                <th className="px-3 py-2">{ko ? "납부" : "Paid"}</th>
                <th className="px-3 py-2">{ko ? "미납" : "Open"}</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {s.obligations.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sam-muted">
                    {s.obligations.unavailable ? <Unavail ko={ko} /> : "0"}
                  </td>
                </tr>
              ) : (
                s.obligations.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <Link href={r.orderHref} className="text-signature hover:underline">
                        {r.orderId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{cashMinor(r.feeDueMinor)}</td>
                    <td className="px-3 py-2 tabular-nums">{cashMinor(r.feePaidMinor)}</td>
                    <td className="px-3 py-2 tabular-nums">{cashMinor(r.feeOutstandingMinor)}</td>
                    <td className="px-3 py-2">{r.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Coin" testId="coin">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-body-secondary space-y-1">
            <div>{ko ? "잔액" : "Balance"}: {s.coin.balance == null ? <Unavail ko={ko} /> : s.coin.balance}</div>
            <div>{ko ? "기간 판매 적립" : "Sale credits"}: {s.coin.saleCredits ?? "UNAVAILABLE"}</div>
            <div>{ko ? "Coin→Cash" : "Converted out"}: {s.coin.conversionsOut ?? "UNAVAILABLE"}</div>
          </div>
        </Section>
        <Section title="Cash" testId="cash">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-body-secondary space-y-1">
            <div>{ko ? "잔액" : "Balance"}: {cashMinor(s.cash.balanceMinor)}</div>
            <div>Top-up: {cashMinor(s.cash.topUpInMinor)}</div>
            <div>Coin→Cash: {cashMinor(s.cash.conversionInMinor)}</div>
            <div>Ad: {cashMinor(s.cash.adDebitMinor)}</div>
            <div>Partner: {cashMinor(s.cash.partnerDebitMinor)}</div>
            <div>Fee: {cashMinor(s.cash.feeDebitMinor)}</div>
            <div>Refund: {cashMinor(s.cash.refundInMinor)}</div>
          </div>
        </Section>
      </div>

      <Section title={ko ? "정산" : "Settlement"} testId="settlements">
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[44rem] text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Gross</th>
                <th className="px-3 py-2">Fee</th>
                <th className="px-3 py-2">Net</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {s.settlements.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sam-muted">
                    {s.settlements.unavailable ? <Unavail ko={ko} /> : "0"}
                  </td>
                </tr>
              ) : (
                s.settlements.rows.map((r) => (
                  <tr key={r.settlementId}>
                    <td className="truncate px-3 py-2">
                      <Link href={r.href} className="text-signature hover:underline">
                        {r.settlementId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="truncate px-3 py-2">{r.orderNo || r.orderId.slice(0, 8)}</td>
                    <td className="px-3 py-2 tabular-nums">{php(r.gross)}</td>
                    <td className="px-3 py-2 tabular-nums">{php(r.fee)}</td>
                    <td className="px-3 py-2 tabular-nums">{php(r.net)}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2 sam-text-xxs">{r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={ko ? "타임라인" : "Timeline"} testId="timeline">
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[48rem] text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">{ko ? "시각" : "When"}</th>
                <th className="px-3 py-2">Domain</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {s.timeline.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sam-muted">
                    {ko ? "기간 내 이벤트 없음" : "No events in period"}
                  </td>
                </tr>
              ) : (
                s.timeline.slice(0, 80).map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-3 py-2 sam-text-xxs">
                      {e.at ? new Date(e.at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">{e.domain}</td>
                    <td className="px-3 py-2">{e.type}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {e.currency === "CASH_MINOR"
                        ? cashMinor(e.amountMinor)
                        : e.currency === "COIN"
                          ? e.amount
                          : php(e.amount)}
                    </td>
                    <td className="truncate px-3 py-2">
                      {e.href && e.relatedId ? (
                        <Link href={e.href} className="text-signature hover:underline">
                          {(e.relatedType || "ref")}:{e.relatedId.slice(0, 8)}
                        </Link>
                      ) : (
                        e.relatedId?.slice(0, 8) || "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

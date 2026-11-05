"use client";

import { useCallback, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminNumber, formatAdminPhpMinor } from "@/lib/admin/ui-standard/admin-format";
import type { AppleIapReconGroup } from "@/lib/apple-iap/apple-iap-reconciliation";

function phtToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

function money(milli: number, currency: string): string {
  return `${(milli / 1000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

const INPUT = "min-h-11 rounded-ui-rect border border-sam-border bg-sam-surface px-3 sam-text-body";

/** A-14 — Apple 결제 대사: 기간 합계 + 거래별 CSV. 수수료·실제 지급액은 App Store Connect 보고서에서 대조한다. */
export function AppleIapReconciliationPanel({ ko }: { ko: boolean }) {
  const today = phtToday();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [groups, setGroups] = useState<AppleIapReconGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; httpStatus?: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/admin/apple-iap/reconciliation?${qs.toString()}`, { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; groups?: AppleIapReconGroup[] };
      if (!res.ok || j.ok !== true) {
        setError({ code: String(j.error ?? "load_failed"), httpStatus: res.status });
        return;
      }
      setGroups(j.groups ?? []);
    } catch {
      setError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const csvHref = `/api/admin/apple-iap/reconciliation?${new URLSearchParams({ from, to, format: "csv" }).toString()}`;

  return (
    <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-apple-iap-recon="1">
      <h2 className="sam-text-section-title font-semibold text-sam-fg">{ko ? "Apple 결제 대사" : "Apple payment reconciliation"}</h2>
      <ol className="list-decimal space-y-1 pl-5 sam-text-helper text-sam-muted">
        <li>
          {ko
            ? "구매일(PHT) 기간을 고르고 합계를 봅니다. 운영 거래는 Production 줄만 비교합니다."
            : "Pick a purchase-date range (PHT). Compare Production rows only."}
        </li>
        <li>
          {ko
            ? "App Store Connect 「Sales and Trends」의 국가·통화별 판매 수·고객 결제가·환불 수와 맞춥니다."
            : "Match units, customer price and refunds by country/currency with App Store Connect Sales and Trends."}
        </li>
        <li>
          {ko
            ? "Apple 수수료·세금·실제 지급액은 DIBAY에 없습니다. 「Payments and Financial Reports」에서 확인하고, 차이가 있으면 거래별 CSV로 찾습니다."
            : "Apple commission, tax and payout are not stored in DIBAY. Check Payments and Financial Reports; use the CSV to find differences."}
        </li>
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 sam-text-helper text-sam-muted">
          {ko ? "시작일" : "From"}
          <input type="date" className={INPUT} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 sam-text-helper text-sam-muted">
          {ko ? "종료일" : "To"}
          <input type="date" className={INPUT} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <AdminActionButton variant="primary" disabled={loading || !from || !to} onClick={() => void load()}>
          {ko ? "합계 보기" : "Show totals"}
        </AdminActionButton>
        <a
          href={csvHref}
          className="inline-flex min-h-11 items-center rounded-ui-rect border border-sam-border px-4 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
          data-apple-iap-recon-csv="1"
        >
          {ko ? "거래별 CSV" : "Per-transaction CSV"}
        </a>
      </div>

      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={() => void load()} />
      ) : groups == null ? null : groups.length === 0 ? (
        <AdminEmptyState ko={ko} message={ko ? "이 기간에 Apple 결제 완료 거래가 없습니다." : "No completed Apple payments in this range."} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border text-sam-muted">
              <tr>
                <th className="px-3 py-2">{ko ? "환경" : "Env"}</th>
                <th className="px-3 py-2">{ko ? "국가 · 통화" : "Country · currency"}</th>
                <th className="px-3 py-2 text-right">{ko ? "결제 건수" : "Purchases"}</th>
                <th className="px-3 py-2 text-right">{ko ? "고객 결제가 합계" : "Customer price total"}</th>
                <th className="px-3 py-2 text-right">{ko ? "지급 완료" : "Credited"}</th>
                <th className="px-3 py-2 text-right">{ko ? "지급 전" : "Not credited"}</th>
                <th className="px-3 py-2 text-right">{ko ? "환불" : "Refunds"}</th>
                <th className="px-3 py-2">{ko ? "환불 처리" : "Refund handling"}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.environment}-${g.storefront}-${g.currency}`} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2">{g.environment}</td>
                  <td className="px-3 py-2">
                    {g.storefront} · {g.currency}
                  </td>
                  <td className="px-3 py-2 text-right">{formatAdminNumber(g.purchases)}</td>
                  <td className="px-3 py-2 text-right">{money(g.customerPriceMilli, g.currency)}</td>
                  <td className="px-3 py-2 text-right">
                    {formatAdminNumber(g.credited)}
                    <span className="block sam-text-xxs text-sam-muted">
                      {g.creditedPoint > 0 ? `${formatAdminNumber(g.creditedPoint)} P` : ""}
                      {g.creditedPoint > 0 && g.creditedCashMinor > 0 ? " · " : ""}
                      {g.creditedCashMinor > 0 ? formatAdminPhpMinor(g.creditedCashMinor) : ""}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right ${g.notCredited > 0 ? "font-semibold text-sam-danger" : ""}`}>
                    {formatAdminNumber(g.notCredited)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatAdminNumber(g.refunds)}
                    {g.refunds > 0 ? (
                      <span className="block sam-text-xxs text-sam-muted">{money(g.refundCustomerPriceMilli, g.currency)}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 sam-text-xxs text-sam-muted">
                    {ko
                      ? `검토 ${g.refundReview} · 회수 ${g.refundRecovered} · 회수 안 함 ${g.refundWaived} · 환불 취소 ${g.refundReversed}`
                      : `Review ${g.refundReview} · Recovered ${g.refundRecovered} · Waived ${g.refundWaived} · Reversed ${g.refundReversed}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

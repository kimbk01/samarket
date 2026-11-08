"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminDecimal, formatAdminNumber, formatAdminPhpMinor } from "@/lib/admin/ui-standard/admin-format";
import { manilaDateKey } from "@/lib/admin/metrics/manila-period";
import type { AppleIapReconGroup } from "@/lib/apple-iap/apple-iap-reconciliation";

function phtToday(): string {
  return manilaDateKey(new Date().toISOString()) ?? "";
}

function phtMonthStart(today: string): string {
  const [y, m] = today.split("-");
  return y && m ? `${y}-${m}-01` : today;
}

function money(milli: number, currency: string): string {
  return `${formatAdminDecimal(milli / 1000)} ${currency}`;
}

const INPUT = "min-h-11 rounded-ui-rect border border-sam-border bg-sam-surface px-3 sam-text-body";

/** A-14 — Apple 결제 대사: 기간 합계 + 거래별 CSV. 수수료·실제 지급액은 App Store Connect 보고서에서 대조한다. */
export function AppleIapReconciliationPanel({ ko }: { ko: boolean }) {
  const { t } = useI18n();
  const today = phtToday();
  const [from, setFrom] = useState(phtMonthStart(today));
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
      <h2 className="sam-text-section-title font-semibold text-sam-fg">{t("admin_apple_iap_apple_payment_reconciliation")}</h2>
      <ol className="list-decimal space-y-1 pl-5 sam-text-helper text-sam-muted">
        <li>
          {t("admin_apple_iap_pick_a_purchase_date_range_pht")}
        </li>
        <li>
          {t("admin_apple_iap_match_units_customer_price_and_refunds")}
        </li>
        <li>
          {t("admin_apple_iap_apple_commission_tax_and_payout_are")}
        </li>
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 sam-text-helper text-sam-muted">
          {t("admin_apple_iap_from")}
          <input type="date" className={INPUT} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 sam-text-helper text-sam-muted">
          {t("admin_apple_iap_to")}
          <input type="date" className={INPUT} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <AdminActionButton variant="primary" disabled={loading || !from || !to} onClick={() => void load()}>
          {t("admin_apple_iap_show_totals")}
        </AdminActionButton>
        <a
          href={csvHref}
          className="inline-flex min-h-11 items-center rounded-ui-rect border border-sam-border px-4 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
          data-apple-iap-recon-csv="1"
        >
          {t("admin_apple_iap_per_transaction_csv")}
        </a>
      </div>

      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={() => void load()} />
      ) : groups == null ? null : groups.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_apple_iap_no_completed_apple_payments_in_this")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("admin_apple_iap_env")}</th>
                <th className="px-3 py-2">{t("admin_apple_iap_country_currency")}</th>
                <th className="px-3 py-2 text-right">{t("admin_apple_iap_purchases")}</th>
                <th className="px-3 py-2 text-right">{t("admin_apple_iap_customer_price_total")}</th>
                <th className="px-3 py-2 text-right">{t("admin_apple_iap_credited")}</th>
                <th className="px-3 py-2 text-right">{t("admin_apple_iap_not_credited")}</th>
                <th className="px-3 py-2 text-right">{t("admin_apple_iap_refunds")}</th>
                <th className="px-3 py-2">{t("admin_apple_iap_refund_handling")}</th>
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
                    {t("admin_apple_iap_refund_handling_counts", {
                      review: g.refundReview,
                      recovered: g.refundRecovered,
                      waived: g.refundWaived,
                      reversed: g.refundReversed,
                    })}
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

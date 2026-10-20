"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { AdFundingTrace } from "@/lib/finance/ad-funding-trace/types";
import {
  formatFinanceAmount,
  financeFundingRailLabel,
  financeStatusLabel,
} from "@/lib/finance/presentation";
import {
  parseFinanceFilters,
  financeCashHref,
  financePointHref,
  financeStoreHref,
  financeTransactionDetailHref,
} from "@/lib/finance/routes";

export function AdminFinanceAdsView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const sp = useSearchParams();
  const filters = useMemo(() => parseFinanceFilters(new URLSearchParams(sp.toString())), [sp]);
  const [rows, setRows] = useState<AdFundingTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: "80" });
      if (filters.storeId) qs.set("storeId", filters.storeId);
      if (filters.memberId) qs.set("memberId", filters.memberId);
      if (filters.wallet === "POINT") qs.set("fundingRail", "MEMBER_POINT");
      if (filters.wallet === "CASH") qs.set("fundingRail", "STORE_CASH");
      const res = await fetch(`/api/admin/finance/ad-funding-traces?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        traces?: AdFundingTrace[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setRows([]);
        return;
      }
      setRows(json.traces ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters.storeId, filters.memberId, filters.wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-finance-ads="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-[16px] font-semibold text-sam-fg">{ko ? "광고 지출" : "Ad spend"}</h2>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "Finance 관점 자금 추적입니다. Ads 운영 화면 복제품이 아닙니다. ADMIN_DIRECT는 재무 거래가 없습니다."
          : "Funding trace for Finance — not Ads ops. ADMIN_DIRECT has no financial transaction."}
      </p>
      {loading ? <AdminLoadingState ko={ko} /> : null}
      {error ? <AdminErrorState ko={ko} code={error} onRetry={() => void load()} /> : null}
      {!loading && rows.length === 0 && !error ? (
        <AdminEmptyState ko={ko} message={ko ? "광고 자금 내역이 없습니다." : "No ad funding rows."} />
      ) : null}
      {rows.length > 0 ? (
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[64rem] text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
            <tr>
              <th className="px-3 py-2">{ko ? "일시" : "When"}</th>
              <th className="px-3 py-2">{ko ? "신청자/매장" : "Applicant / store"}</th>
              <th className="px-3 py-2">{ko ? "광고 유형" : "Ad product"}</th>
              <th className="px-3 py-2">{ko ? "Funding Rail" : "Funding rail"}</th>
              <th className="px-3 py-2 text-right">{ko ? "금액" : "Amount"}</th>
              <th className="px-3 py-2">{ko ? "상태" : "Status"}</th>
              <th className="px-3 py-2">{ko ? "광고" : "Ad ref"}</th>
              <th className="px-3 py-2">{ko ? "Finance TX" : "Finance TX"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sam-border-soft">
            {rows.map((r) => {
              const when = r.activeAt || r.approvedAt || null;
              const applicant =
                r.applicantType === "member" && r.memberId
                  ? `${ko ? "회원" : "Member"} · ${r.memberId.slice(0, 8)}…`
                  : r.storeId
                    ? `${ko ? "매장" : "Store"} · ${r.storeId.slice(0, 8)}…`
                    : r.applicantType === "admin"
                      ? "Admin"
                      : "—";
              const financeTxHref =
                r.fundingRail === "ADMIN_DIRECT" || !r.fundingTransactionId
                  ? null
                  : r.fundingRail === "MEMBER_POINT"
                    ? financePointHref({ adId: r.adId })
                    : financeTransactionDetailHref(`cash:${r.fundingTransactionId}`, {
                        storeId: r.storeId,
                        adId: r.adId,
                      });
              return (
                <tr key={`${r.family}:${r.adId}`} data-finance-ad-funding-row={r.adId}>
                  <td className="px-3 py-2 sam-text-xxs whitespace-nowrap">
                    {when ? formatAdminManilaDateTime(when) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.storeId ? (
                      <Link
                        href={financeStoreHref(r.storeId, filters)}
                        className="font-semibold text-signature hover:underline"
                      >
                        {applicant}
                      </Link>
                    ) : (
                      applicant
                    )}
                  </td>
                  <td className="px-3 py-2">{r.adProduct}</td>
                  <td className="px-3 py-2">{financeFundingRailLabel(r.fundingRail, ko)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.walletType === "N_A" || r.fundingRail === "ADMIN_DIRECT"
                      ? "—"
                      : formatFinanceAmount({
                          wallet: r.walletType === "POINT" ? "POINT" : "CASH",
                          amount: r.walletType === "CASH" ? r.priceMinor : r.price,
                          isMinor: r.walletType === "CASH",
                        })}
                  </td>
                  <td className="px-3 py-2">{financeStatusLabel(r.status, ko)}</td>
                  <td className="px-3 py-2">
                    {r.adDetailHref ? (
                      <Link href={r.adDetailHref} className="font-semibold text-signature hover:underline">
                        {ko ? "광고 상세" : "Ad detail"}
                      </Link>
                    ) : (
                      <span className="font-mono text-[12px]">{r.adId.slice(0, 8)}…</span>
                    )}
                    {r.legacyLabel ? (
                      <span className="ml-1 rounded bg-sam-warning-soft px-1 text-[12px] font-bold text-sam-warning">
                        {r.legacyLabel}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {r.fundingRail === "ADMIN_DIRECT" ? (
                      <span className="text-sam-muted">{ko ? "재무 거래 없음" : "No finance TX"}</span>
                    ) : financeTxHref ? (
                      <Link href={financeTxHref} className="font-semibold text-signature hover:underline">
                        {ko ? "결제 내역" : "Payment TX"}
                      </Link>
                    ) : r.fundingTransactionId ? (
                      <Link
                        href={
                          r.fundingRail === "MEMBER_POINT"
                            ? financePointHref({ adId: r.adId })
                            : financeCashHref({ storeId: r.storeId, adId: r.adId })
                        }
                        className="font-semibold text-signature hover:underline"
                      >
                        {ko ? "결제 내역 보기" : "Payment history"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      ) : null}
    </div>
  );
}

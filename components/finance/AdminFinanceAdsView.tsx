"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFinancePeriodSums } from "@/components/finance/AdminFinancePeriodSums";
import {
  adFundingSumCells,
  adminFinanceRangeText,
  readAdFundingSums,
  type AdFundingSourceSum,
} from "@/lib/finance/admin-finance-period-sums";

/** 필터 키 — 기존 주소 키 그대로 (`?wallet=POINT|CASH`·`?storeId=`·`?memberId=` 딥링크 호환). API 가 받는 조건만. */
const FINANCE_ADS_EXTRAS = ["wallet", "storeId", "memberId"] as const;
type FinanceAdsExtra = (typeof FINANCE_ADS_EXTRAS)[number];

const FIELD =
  "h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]";

/**
 * R7 — 서버 페이지 (주소 `page`·`size` → API `limit`/`offset`, 전체 건수 = 서버 total).
 * C-1 — 기간(from/to PHT, 주소 공통 키) + 같은 조건 전체의 출처·상태별 합계(쪽과 무관).
 */
export function AdminFinanceAdsView() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const sp = useSearchParams();
  const filters = useMemo(() => parseFinanceFilters(new URLSearchParams(sp.toString())), [sp]);
  const lq = useAdminListQuery<FinanceAdsExtra>({ extras: FINANCE_ADS_EXTRAS });
  /** 텍스트형 조건(매장·회원 ID) — 「조회」/Enter 때 적용. 주소가 바뀌면 다시 맞춘다. */
  const appliedIds = `${lq.query.extras.storeId}\u0000${lq.query.extras.memberId}`;
  const [idDraft, setIdDraft] = useState({ key: appliedIds, storeId: lq.query.extras.storeId, memberId: lq.query.extras.memberId });
  let ids = idDraft;
  if (idDraft.key !== appliedIds) {
    ids = { key: appliedIds, storeId: lq.query.extras.storeId, memberId: lq.query.extras.memberId };
    setIdDraft(ids);
  }
  const [rows, setRows] = useState<AdFundingTrace[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sums, setSums] = useState<AdFundingSourceSum[] | null>(null);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    setSums(null);
    try {
      const qs = new URLSearchParams({
        limit: String(lq.query.size),
        offset: String((lq.query.page - 1) * lq.query.size),
      });
      if (filters.storeId) qs.set("storeId", filters.storeId);
      if (filters.memberId) qs.set("memberId", filters.memberId);
      if (filters.wallet === "POINT") qs.set("fundingRail", "MEMBER_POINT");
      if (filters.wallet === "CASH") qs.set("fundingRail", "STORE_CASH");
      if (filters.from) qs.set("from", filters.from);
      if (filters.to) qs.set("to", filters.to);
      const res = await fetch(`/api/admin/finance/ad-funding-traces?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        traces?: AdFundingTrace[];
        total?: number;
        sumsBySource?: unknown;
        error?: string;
      };
      if (seq !== seqRef.current) return;
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setRows([]);
        setTotal(0);
        return;
      }
      const list = json.traces ?? [];
      setRows(list);
      setTotal(typeof json.total === "number" ? json.total : list.length);
      setSums(readAdFundingSums(json.sumsBySource));
    } catch {
      if (seq !== seqRef.current) return;
      setError("network_error");
      setRows([]);
      setTotal(0);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [filters.storeId, filters.memberId, filters.wallet, filters.from, filters.to, lq.query.page, lq.query.size]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-finance-ads="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-[16px] font-semibold text-sam-fg">{t("finance_nav_ad_spend")}</h2>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_finance_funding_trace_for_finance_not_ads")}
      </p>
      <AdminFilterBar
        ko={ko}
        requireCompletePeriod
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={() =>
          lq.patch({
            from: lq.draft.from,
            to: lq.draft.to,
            extras: { storeId: ids.storeId.trim(), memberId: ids.memberId.trim() },
          })
        }
        onReset={lq.reset}
        pending={loading}
        showSearch={false}
      >
        <label className={LABEL}>
          {t("admin_finance_funding_rail")}
          <select
            className={FIELD}
            value={lq.query.extras.wallet}
            onChange={(e) => lq.setExtra("wallet", e.target.value)}
            data-finance-ads-filter-wallet="1"
          >
            <option value="">{t("admin_biz_ops_filter_all")}</option>
            <option value="POINT">{financeFundingRailLabel("MEMBER_POINT", ko)}</option>
            <option value="CASH">{financeFundingRailLabel("STORE_CASH", ko)}</option>
          </select>
        </label>
        <label className={LABEL}>
          {t("finance_store_id")}
          <input
            className={`${FIELD} min-w-[10rem]`}
            value={ids.storeId}
            onChange={(e) => setIdDraft({ ...ids, storeId: e.target.value })}
            name="storeId"
          />
        </label>
        <label className={LABEL}>
          {t("admin_finance_member_id")}
          <input
            className={`${FIELD} min-w-[10rem]`}
            value={ids.memberId}
            onChange={(e) => setIdDraft({ ...ids, memberId: e.target.value })}
            name="memberId"
          />
        </label>
      </AdminFilterBar>
      {!loading && !error && sums ? (
        <AdminFinancePeriodSums
          ko={ko}
          range={adminFinanceRangeText({ from: filters.from, to: filters.to }, ko)}
          basis={
            t("admin_finance_by_list_time_start_review_created")
          }
          cells={adFundingSumCells(sums, ko)}
        />
      ) : null}
      {loading ? <AdminLoadingState ko={ko} /> : null}
      {error ? <AdminErrorState ko={ko} code={error} onRetry={() => void load()} /> : null}
      {!loading && rows.length === 0 && !error ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_finance_no_ad_funding_rows")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : null}
      {rows.length > 0 ? (
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[64rem] text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
            <tr>
              <th className="px-3 py-2">{t("finance_when_pht")}</th>
              <th className="px-3 py-2">{t("admin_finance_applicant_store")}</th>
              <th className="px-3 py-2">{t("admin_finance_ad_product")}</th>
              <th className="px-3 py-2">{t("admin_finance_funding_rail_2")}</th>
              <th className="px-3 py-2 text-right">{t("finance_amount")}</th>
              <th className="px-3 py-2">{t("admin_biz_label_status")}</th>
              <th className="px-3 py-2">{t("admin_finance_ad_ref")}</th>
              <th className="px-3 py-2">{t("admin_finance_finance_tx")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sam-border-soft">
            {rows.map((r) => {
              const when = r.activeAt || r.approvedAt || null;
              const applicant =
                r.applicantType === "member" && r.memberId
                  ? `${t("admin_finance_member_2")} · ${r.memberId.slice(0, 8)}…`
                  : r.storeId
                    ? `${t("admin_biz_ops_th_store")} · ${r.storeId.slice(0, 8)}…`
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
                        {t("finance_ad_detail_cta")}
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
                      <span className="text-sam-muted">{t("admin_finance_no_finance_tx")}</span>
                    ) : financeTxHref ? (
                      <Link href={financeTxHref} className="font-semibold text-signature hover:underline">
                        {t("admin_finance_payment_tx")}
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
                        {t("admin_finance_payment_history")}
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
    </div>
  );
}

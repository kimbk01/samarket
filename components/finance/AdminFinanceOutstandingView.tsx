"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { financeOrderHref, financeStoreHref, parseFinanceFilters } from "@/lib/finance/routes";
import { financeStatusLabel, formatFinanceAmount } from "@/lib/finance/presentation";
import { MemberOpsListBody } from "@/components/admin/member-ops/MemberOpsListBody";
import { useMemberOpsPagedFetch } from "@/lib/admin/member-ops-list/use-member-ops-paged-fetch";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFinancePeriodSums } from "@/components/finance/AdminFinancePeriodSums";
import { outstandingSumCells, readOutstandingSums } from "@/lib/finance/admin-finance-period-sums";

const FIELD =
  "h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]";

type ObligationRow = {
  id: string;
  store_id: string;
  store_name?: string | null;
  order_id: string;
  fee_due_minor: number;
  fee_paid_minor: number;
  fee_outstanding_minor: number;
  status: string;
  created_at: string;
};

/**
 * Fee / outstanding operational list.
 * Columns map to canonical obligation fields only — no invented aggregates.
 */
export function AdminFinanceOutstandingView() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const sp = useSearchParams();
  const filters = useMemo(() => parseFinanceFilters(new URLSearchParams(sp.toString())), [sp]);
  /** 쪽·크기 + 매장 조건(`storeId` — API 가 받는 유일한 조건, 진입 링크 키 그대로)을 주소에. 서버 페이지 + 총 건수. */
  const lq = useAdminListQuery<"storeId">({ extras: ["storeId"] });
  /** 매장 ID 입력 — 「조회」/Enter 때 적용. 주소가 바뀌면 다시 맞춘다. */
  const [storeDraft, setStoreDraft] = useState({ key: lq.query.extras.storeId, value: lq.query.extras.storeId });
  let storeInput = storeDraft;
  if (storeDraft.key !== lq.query.extras.storeId) {
    storeInput = { key: lq.query.extras.storeId, value: lq.query.extras.storeId };
    setStoreDraft(storeInput);
  }
  const apiQs = useMemo(() => {
    const qs = new URLSearchParams(lq.apiQueryString);
    if (filters.storeId) qs.set("storeId", filters.storeId);
    return qs.toString();
  }, [lq.apiQueryString, filters.storeId]);
  const list = useMemberOpsPagedFetch<ObligationRow>(`/api/admin/finance/outstanding?${apiQs}`, "rows", lq.refreshKey);
  const rows = list.rows;
  /** C-1 — 같은 조건 전체 합계(쪽과 무관). 조회 중·실패 때는 숨긴다(이전 매장 값이 보이지 않게). */
  const sums = !list.loading && !list.error ? readOutstandingSums(list.json?.sums) : null;

  return (
    <div className="space-y-4" data-admin-finance-outstanding="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-[16px] font-semibold text-sam-fg">{t("admin_finance_fees_outstanding")}</h2>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_finance_row_opens_ordermoneychain_store_name_comes")}
      </p>
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={() => lq.setExtra("storeId", storeInput.value.trim())}
        onReset={lq.reset}
        pending={list.loading}
        showPeriod={false}
        showSearch={false}
      >
        <label className={LABEL}>
          {t("admin_finance_store_id_empty_all_open")}
          <input
            className={`${FIELD} min-w-[14rem]`}
            value={storeInput.value}
            onChange={(e) => setStoreDraft({ ...storeInput, value: e.target.value })}
            name="storeId"
          />
        </label>
      </AdminFilterBar>
      {sums ? (
        <AdminFinancePeriodSums
          ko={ko}
          title={t("admin_finance_totals")}
          range={null}
          basis={
            filters.storeId
              ? t("admin_finance_all_statuses_of_this_store")
              : t("admin_finance_all_stores_open")
          }
          cells={outstandingSumCells(sums, ko)}
        />
      ) : null}
      <MemberOpsListBody
        ko={ko}
        loading={list.loading}
        loaded={list.loaded}
        error={list.error}
        onRetry={lq.refresh}
        rowCount={rows.length}
        total={list.total}
        page={lq.query.page}
        size={lq.query.size}
        onPageChange={lq.setPage}
        onSizeChange={lq.setSize}
        emptyMessage={t("admin_finance_no_outstanding_fees")}
      >
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[56rem] text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
            <tr>
              <th className="px-3 py-2">{t("admin_finance_date")}</th>
              <th className="px-3 py-2">{t("admin_biz_ops_th_store")}</th>
              <th className="px-3 py-2">{t("finance_order")}</th>
              <th className="px-3 py-2 text-right">{t("admin_finance_fee_due")}</th>
              <th className="px-3 py-2 text-right">{t("admin_finance_cash_paid")}</th>
              <th className="px-3 py-2 text-right">{t("admin_finance_outstanding_created")}</th>
              <th className="px-3 py-2 text-right">{t("admin_finance_collected")}</th>
              <th className="px-3 py-2 text-right">{t("admin_finance_remaining")}</th>
              <th className="px-3 py-2">{t("admin_biz_label_status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sam-border-soft">
            {rows.map((r) => {
              const orderHref = financeOrderHref(r.order_id, { ...filters, storeId: r.store_id });
              const storeHref = financeStoreHref(r.store_id, filters);
              // Canonical mapping: due / paid / remaining.
              // F-2 (Owner 「관리자 회계 용어 변경 금지」) — R8-f 에서 지운 「Outstanding Created」(= Fee Due)·
              // 「Outstanding Collected」(= Cash Paid) 두 열 복원. Created ≈ due (initial obligation).
              // R7-b — Cash(센타보) = 소수점 2자리.
              const due = r.fee_due_minor;
              const paid = r.fee_paid_minor;
              const remaining = r.fee_outstanding_minor;
              return (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-sam-app"
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(orderHref)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(orderHref);
                    }
                  }}
                  data-finance-outstanding-row={r.id}
                >
                  <td className="px-3 py-2 sam-text-xxs whitespace-nowrap">
                    {r.created_at ? formatAdminManilaDateTime(r.created_at) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={storeHref}
                      className="font-semibold text-signature hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="block">{r.store_name || t("admin_biz_ops_th_store")}</span>
                      <span className="block font-mono text-[12px] text-sam-muted">
                        {r.store_id.slice(0, 8)}…
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={orderHref}
                      className="font-semibold text-signature hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.order_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatFinanceAmount({ wallet: "CASH", amount: due, isMinor: true })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatFinanceAmount({ wallet: "CASH", amount: paid, isMinor: true })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatFinanceAmount({ wallet: "CASH", amount: due, isMinor: true })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatFinanceAmount({ wallet: "CASH", amount: paid, isMinor: true })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {formatFinanceAmount({ wallet: "CASH", amount: remaining, isMinor: true })}
                  </td>
                  <td className="px-3 py-2">{financeStatusLabel(r.status, ko)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </MemberOpsListBody>
    </div>
  );
}

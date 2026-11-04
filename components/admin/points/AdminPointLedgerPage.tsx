"use client";

import { Suspense } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointFinancialHistoryItem } from "@/lib/points/point-financial-history";
import { AdminPointAdjustPanel } from "@/components/admin/points/AdminPointAdjustPanel";
import { AdminPointRefundPendingPanel } from "@/components/admin/points/AdminPointRefundPendingPanel";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { MemberOpsListBody } from "@/components/admin/member-ops/MemberOpsListBody";
import { useMemberOpsPagedFetch } from "@/lib/admin/member-ops-list/use-member-ops-paged-fetch";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { adminOperatorLabel } from "@/lib/admin/operator-ux/operator-labels";
import { AdminFinancePeriodSums } from "@/components/finance/AdminFinancePeriodSums";
import { formatAdminPointBucketLine, type AdminPointBucketSums } from "@/lib/admin/points/admin-point-bucket-line";
import { adminFinanceRangeText } from "@/lib/finance/admin-finance-period-sums";

function formatSigned(signed: number): string {
  const abs = formatAdminNumber(Math.abs(signed));
  return signed < 0 ? `-${abs} P` : `+${abs} P`;
}

const LEDGER_FILTER_LABEL: Record<"credit" | "debit", { ko: string; en: string }> = {
  credit: { ko: "적립", en: "Credit" },
  debit: { ko: "차감", en: "Debit" },
};

const LEDGER_STATUSES = ["credit", "debit"] as const;

type LedgerRow = PointFinancialHistoryItem & { userNickname?: string };

/** `useSearchParams` 사용 — Suspense 경계 안에서 그린다 (Next App Router 규칙). */
export function AdminPointLedgerPage() {
  return (
    <Suspense fallback={null}>
      <AdminPointLedgerPageInner />
    </Suspense>
  );
}

/**
 * 포인트 원장 (R7 목록 표준) — 조건(구분·회원 UUID·기간 PHT)은 주소에 남고, 서버 페이지(limit/offset + 총 건수).
 * 예전 「더 보기」 커서(50건씩)·조건 미보존 대체.
 */
function AdminPointLedgerPageInner() {
  const { t, language, safeT } = useI18n();
  const ko = language !== "en";
  const action = useAdminRouteAction("/admin/points/ledger");
  const lq = useAdminListQuery({ statuses: LEDGER_STATUSES });
  const list = useMemberOpsPagedFetch<LedgerRow>(`/api/admin/points/ledger?${lq.apiQueryString}`, "items", lq.refreshKey);
  const items = list.rows;
  /** C-1 — 같은 조건 전체의 칸별 합계. 조회 중·실패 때는 숨긴다(이전 조건 값이 새 조건 아래 보이지 않게). */
  const bucketSums =
    !list.loading && !list.error ? ((list.json?.bucketSums as AdminPointBucketSums | null | undefined) ?? null) : null;

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_points_ledger" />

      {!action.allowed && action.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {ko ? `지급·회수 버튼 비활성: ${action.reason}` : `Actions disabled: ${action.reason}`}
        </p>
      ) : null}

      <AdminPointAdjustPanel actionAllowed={action.allowed} onChanged={list.reload} />
      <AdminPointRefundPendingPanel ko={ko} />

      <AdminFilterBar
        ko={ko}
        requireCompletePeriod
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        pending={list.loading}
        searchPlaceholder={safeT("point_fin_admin_user_filter", {
          fallbackKo: "회원 UUID (선택)",
          fallbackEn: "Member UUID (optional)",
        })}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          label: ko ? "구분" : "Type",
          options: LEDGER_STATUSES.map((id) => ({ value: id, label: ko ? LEDGER_FILTER_LABEL[id].ko : LEDGER_FILTER_LABEL[id].en })),
        }}
      />

      {bucketSums ? (
        <AdminFinancePeriodSums
          ko={ko}
          title={ko ? "조건 합계" : "Totals"}
          range={adminFinanceRangeText({ from: lq.query.from, to: lq.query.to }, ko)}
          basis={ko ? "원장 기록 시각 기준 · 구분·회원 조건 적용" : "by ledger time · type/member filters applied"}
          cells={null}
          line={`${formatAdminPointBucketLine(bucketSums, formatAdminNumber)} · ${
            ko ? `${formatAdminNumber(bucketSums.rows)}줄` : `${formatAdminNumber(bucketSums.rows)} rows`
          }`}
        />
      ) : null}

      <MemberOpsListBody
        ko={ko}
        loading={list.loading}
        loaded={list.loaded}
        error={list.error}
        onRetry={lq.refresh}
        rowCount={items.length}
        total={list.total}
        page={lq.query.page}
        size={lq.query.size}
        onPageChange={lq.setPage}
        onSizeChange={lq.setSize}
        isFiltered={lq.isFiltered}
        onReset={lq.reset}
        emptyMessage={t("admin_points_ledger_empty")}
      >
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[1080px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium">{ko ? "거래 ID" : "Txn ID"}</th>
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_datetime")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_user")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_type")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{ko ? "사용처" : "Usage"}</th>
                <th className="px-3 py-2.5 text-right font-medium">{ko ? "이전 잔액" : "Before"}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("admin_points_th_amount")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("admin_points_th_balance")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{ko ? "처리 주체" : "Actor"}</th>
                <th className="px-3 py-2.5 text-left font-medium">{ko ? "원천 거래" : "Source"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => {
                const title = language === "en" ? e.fallbackTitleEn : e.fallbackTitleKo;
                const usage = e.promotion
                  ? e.promotion.targetTitle
                  : e.subtitle || e.description;
                return (
                  <tr key={e.ledgerId} className="border-b border-sam-border-soft hover:bg-sam-app">
                    <td className="px-3 py-2.5">
                      <AdminTechId id={e.ledgerId} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {formatAdminManilaDateTime(e.occurredAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      {e.userNickname || "—"}{" "}
                      <AdminTechId id={e.userId} />
                    </td>
                    <td className="px-3 py-2.5">{title}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-sam-muted">{usage}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-sam-muted">
                      {/* 원장 기록값 기준: 이전 = 처리 후 − 증감 (화면 추정이 아니라 같은 행의 두 기록값) */}
                      {formatAdminNumber(e.balanceAfter - e.signedAmount)}P
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                        e.direction === "credit" ? "text-sam-success" : "text-sam-danger"
                      }`}
                    >
                      {formatSigned(e.signedAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatAdminNumber(e.balanceAfter)}P</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-sam-muted">
                      {e.actorType === "admin"
                        ? ko ? "관리자" : "Admin"
                        : e.actorType === "user"
                          ? ko ? "회원" : "Member"
                          : ko ? "시스템" : "System"}
                      {e.actorId ? (
                        <>
                          {" "}
                          <AdminTechId id={e.actorId} />
                        </>
                      ) : null}
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5 text-sam-muted">
                      <span className="block truncate">{adminOperatorLabel(e.relatedType, ko)}</span>
                      {e.relatedId ? <AdminTechId id={e.relatedId} /> : null}
                    </td>
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

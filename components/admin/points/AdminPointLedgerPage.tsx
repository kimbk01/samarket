"use client";

import { Suspense } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointFinancialHistoryItem } from "@/lib/points/point-financial-history";
import { AdminPointAdjustPanel } from "@/components/admin/points/AdminPointAdjustPanel";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { MemberOpsListBody } from "@/components/admin/member-ops/MemberOpsListBody";
import { useMemberOpsPagedFetch } from "@/lib/admin/member-ops-list/use-member-ops-paged-fetch";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

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

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_points_ledger" />

      {!action.allowed && action.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {ko ? `지급·회수 버튼 비활성: ${action.reason}` : `Actions disabled: ${action.reason}`}
        </p>
      ) : null}

      <AdminPointAdjustPanel actionAllowed={action.allowed} onChanged={list.reload} />

      <AdminFilterBar
        ko={ko}
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
          <table className="w-full min-w-[720px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_datetime")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_user")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{t("admin_points_th_type")}</th>
                <th className="px-3 py-2.5 text-left font-medium">{ko ? "사용처" : "Usage"}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("admin_points_th_amount")}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t("admin_points_th_balance")}</th>
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
                    <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                      {formatAdminManilaDateTime(e.occurredAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      {e.userNickname || "—"}{" "}
                      <AdminTechId id={e.userId} />
                    </td>
                    <td className="px-3 py-2.5">{title}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-sam-muted">{usage}</td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                        e.direction === "credit" ? "text-sam-success" : "text-sam-danger"
                      }`}
                    >
                      {formatSigned(e.signedAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatAdminNumber(e.balanceAfter)}P</td>
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

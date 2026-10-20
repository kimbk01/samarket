"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getLaunchWeekKpis } from "@/lib/launch-week/launch-week-state";
import { AdminTable } from "@/components/admin/AdminTable";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["date"] as const;

export function LaunchWeekKpiTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const observedDate = lq.query.extras.date as string;
  const kpis = useMemo(
    () =>
      getLaunchWeekKpis(
        observedDate ? { observedDate } : undefined
      ),
    [observedDate]
  );

  const dates = useMemo(() => {
    const list = getLaunchWeekKpis();
    return [...new Set(list.map((k) => k.observedDate))].sort().reverse();
  }, []);

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect ko={ko} label={t("admin_launch_week_kdf8167af")} name="date" value={lq.query.extras.date} onChange={(v) => lq.setExtra("date", v)}>
          <option value="">{t("admin_launch_week_filter_all_days")}</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </AdminFilterSelect>
      </AdminFilterBar>

      <p className="sam-text-helper text-sam-muted">
        시간대별 운영 타임라인은 placeholder로 확장 가능합니다.
      </p>

      {kpis.length === 0 ? (
        <AdminEmptyState ko={ko} message={"해당 일자 KPI가 없습니다."} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <AdminTable
          headers={[
            "일자",
            "가입",
            "상품등록",
            "채팅시작",
            "거래완료",
            "신고",
            "장애",
            "Fallback",
            "Kill Switch",
            "포인트충전",
            "광고신청",
          ]}
        >
          {kpis.map((k) => (
            <tr key={k.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {k.observedDate}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {k.signUpCount}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {k.productCreatedCount}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {k.chatStartedCount}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {k.transactionCompletedCount}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {k.reportCreatedCount}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {k.incidentCount}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {k.fallbackCount}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {k.killSwitchCount}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {k.pointChargeRequestCount}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {k.adApplicationCount}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

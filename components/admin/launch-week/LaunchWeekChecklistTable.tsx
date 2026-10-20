"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getLaunchWeekChecklistItems } from "@/lib/launch-week/launch-week-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getAreaLabel,
  getChecklistStatusLabel,
  getPriorityLabel,
} from "@/lib/launch-week/launch-week-utils";
import type {
  LaunchWeekDayNumber,
  LaunchWeekChecklistStatus,
} from "@/lib/types/launch-week";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["day"] as const;

export function LaunchWeekChecklistTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const dayNumber = (lq.query.extras.day ? Number(lq.query.extras.day) : "") as LaunchWeekDayNumber | "";
  const status = lq.query.status as LaunchWeekChecklistStatus | "";
  const items = useMemo(
    () =>
      getLaunchWeekChecklistItems({
        ...(dayNumber ? { dayNumber: dayNumber as LaunchWeekDayNumber } : {}),
        ...(status ? { status: status as LaunchWeekChecklistStatus } : {}),
      }),
    [dayNumber, status]
  );

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
        <AdminFilterSelect ko={ko} label={"Day"} name="day" value={lq.query.extras.day} onChange={(v) => lq.setExtra("day", v)}>
          <option value="">{t("common_all")}</option>
          {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
            <option key={d} value={d}>
              Day {d}
            </option>
          ))}
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_qa_status_2")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          <option value="">{t("common_all")}</option>
          <option value="todo">{t("admin_launch_week_todo")}</option>
          <option value="in_progress">{t("admin_qa_in_progress")}</option>
          <option value="done">{t("admin_qa_done")}</option>
          <option value="blocked">{t("admin_qa_blocked")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {items.length === 0 ? (
        <AdminEmptyState ko={ko} message={"해당 조건 체크리스트가 없습니다."} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <AdminTable
          headers={[
            "Day",
            "영역",
            "제목",
            "상태",
            "우선순위",
            "담당",
            "차단/비고",
            "확인일시",
          ]}
        >
          {items.map((i) => (
            <tr
              key={i.id}
              className={`border-b border-sam-border-soft ${
                i.status === "blocked" ? "bg-sam-danger-soft" : ""
              }`}
            >
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                Day {i.dayNumber}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getAreaLabel(i.area)}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {i.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    i.status === "done"
                      ? "bg-sam-success-soft text-sam-success"
                      : i.status === "blocked"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : "bg-sam-warning-soft text-sam-warning"
                  }`}
                >
                  {getChecklistStatusLabel(i.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getPriorityLabel(i.priority)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {i.ownerAdminNickname ?? "-"}
              </td>
              <td className="max-w-[160px] px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.blockerReason || i.note || "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.checkedAt
                  ? formatAdminManilaDateTime(i.checkedAt)
                  : "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

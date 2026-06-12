"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
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

export function LaunchWeekChecklistTable() {
  const { t } = useI18n();
  const [dayNumber, setDayNumber] = useState<LaunchWeekDayNumber | "">("");
  const [status, setStatus] = useState<LaunchWeekChecklistStatus | "">("");
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">Day</span>
        <select
          value={dayNumber}
          onChange={(e) =>
            setDayNumber((e.target.value || "") as LaunchWeekDayNumber | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("common_all")}</option>
          {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
            <option key={d} value={d}>
              Day {d}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_qa_status_2")}</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as LaunchWeekChecklistStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("common_all")}</option>
          <option value="todo">{t("admin_launch_week_todo")}</option>
          <option value="in_progress">{t("admin_qa_in_progress")}</option>
          <option value="done">{t("admin_qa_done")}</option>
          <option value="blocked">{t("admin_qa_blocked")}</option>
        </select>
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          해당 조건 체크리스트가 없습니다.
        </div>
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
                i.status === "blocked" ? "bg-red-50/30" : ""
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
                      ? "bg-emerald-100 text-emerald-800"
                      : i.status === "blocked"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
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
                  ? new Date(i.checkedAt).toLocaleString()
                  : "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

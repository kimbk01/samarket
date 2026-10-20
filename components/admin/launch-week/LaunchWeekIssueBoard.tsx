"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getLaunchWeekIssues } from "@/lib/launch-week/launch-week-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getAreaLabel,
  getSeverityLabel,
  getIssueStatusLabel,
} from "@/lib/launch-week/launch-week-utils";
import type {
  LaunchWeekDayNumber,
  LaunchWeekIssueStatus,
} from "@/lib/types/launch-week";
import Link from "next/link";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["day"] as const;

export function LaunchWeekIssueBoard() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const dayNumber = (lq.query.extras.day ? Number(lq.query.extras.day) : "") as LaunchWeekDayNumber | "";
  const status = lq.query.status as LaunchWeekIssueStatus | "";
  const issues = useMemo(
    () =>
      getLaunchWeekIssues({
        ...(dayNumber ? { dayNumber: dayNumber as LaunchWeekDayNumber } : {}),
        ...(status ? { status: status as LaunchWeekIssueStatus } : {}),
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
          <option value="open">{t("admin_qa_open")}</option>
          <option value="investigating">{t("admin_launch_week_kd59552c1")}</option>
          <option value="mitigated">{t("admin_launch_week_k0e7ca9ba")}</option>
          <option value="resolved">{t("admin_launch_week_resolved")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {issues.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : "긴급 이슈가 없습니다."}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <AdminTable
          headers={[
            "Day",
            "제목",
            "영역",
            "심각도",
            "상태",
            "담당",
            "오픈/해결",
            "연결",
            "비고",
          ]}
        >
          {issues.map((i) => (
            <tr
              key={i.id}
              className={`border-b border-sam-border-soft ${
                i.severity === "critical" &&
                !["resolved", "mitigated"].includes(i.status)
                  ? "bg-sam-danger-soft"
                  : ""
              }`}
            >
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                Day {i.dayNumber}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {i.title}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getAreaLabel(i.category)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    i.severity === "critical"
                      ? "bg-sam-danger-soft text-sam-danger"
                      : i.severity === "high"
                        ? "bg-sam-warning-soft text-sam-warning"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getSeverityLabel(i.severity)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    i.status === "resolved"
                      ? "bg-sam-success-soft text-sam-success"
                      : i.status === "open"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : "bg-sam-warning-soft text-sam-warning"
                  }`}
                >
                  {getIssueStatusLabel(i.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {i.ownerAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDate(i.openedAt)}
                {i.resolvedAt &&
                  ` → ${formatAdminManilaDate(i.resolvedAt)}`}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.linkedType && i.linkedId ? (
                  i.linkedType === "qa_issue" ? (
                    <Link
                      href="/admin/qa-board"
                      className="text-signature hover:underline"
                    >
                      {i.linkedId}
                    </Link>
                  ) : (
                    `${i.linkedType}: ${i.linkedId}`
                  )
                ) : (
                  "-"
                )}
              </td>
              <td className="max-w-[140px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

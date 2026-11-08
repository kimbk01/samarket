"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getQaPilotChecks } from "@/lib/qa-board/qa-board-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getPilotCategoryLabel,
  getPilotStatusLabel,
} from "@/lib/qa-board/qa-board-utils";
import type {
  QaPilotCategory,
  QaPilotCheckStatus,
} from "@/lib/types/qa-board";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["category"] as const;

export function QaPilotCheckTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const category = lq.query.extras.category as QaPilotCategory | "";
  const checks = useMemo(
    () =>
      getQaPilotChecks(
        category ? { category: category as QaPilotCategory } : undefined
      ),
    [category]
  );

  const categories = [
    { value: "" as const, labelKey: "admin_all" as const },
    { value: "onboarding" as const, labelKey: "admin_qa_board_pilot_onboarding" as const },
    { value: "browsing" as const, labelKey: "admin_qa_board_pilot_browsing" as const },
    { value: "posting" as const, labelKey: "admin_feed_emergency_posting" as const },
    { value: "chat" as const, labelKey: "admin_review_chat_2" as const },
    { value: "reporting" as const, labelKey: "admin_qa_board_pilot_reporting" as const },
    { value: "points" as const, labelKey: "admin_qa_board_pilot_points" as const },
    { value: "admin_response" as const, labelKey: "admin_qa_board_pilot_admin_response" as const },
  ];

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
        <AdminFilterSelect ko={ko} label={t("admin_qa_category")} name="category" value={lq.query.extras.category} onChange={(v) => lq.setExtra("category", v)}>
          {categories.map((c) => (
            <option key={c.value || "all"} value={c.value}>
              {t(c.labelKey)}
            </option>
          ))}
        </AdminFilterSelect>
      </AdminFilterBar>

      <p className="sam-text-helper text-sam-muted">
        {t("admin_qa_board_pilot_feedback_hint")}
      </p>

      {checks.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_qa_board_no_pilot_checks")} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <AdminTable
          headers={[t("admin_qa_board_th_title"), t("admin_qa_board_th_category"), t("admin_qa_board_th_status"), t("admin_qa_board_th_owner"), t("admin_qa_board_th_note")]}
        >
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.status === "blocked" ? "bg-sam-danger-soft/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {c.title}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getPilotCategoryLabel(t, c.category)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    c.status === "done"
                      ? "bg-sam-success-soft text-sam-success"
                      : c.status === "blocked"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : "bg-sam-warning-soft text-sam-warning"
                  }`}
                >
                  {getPilotStatusLabel(t, c.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {c.assignedAdminNickname ?? "-"}
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

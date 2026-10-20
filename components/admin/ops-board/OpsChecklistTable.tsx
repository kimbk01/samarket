"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpsChecklistItemStatus } from "@/lib/types/ops-board";
import { getOpsDailyChecklistItems } from "@/lib/ops-board/ops-board-state";
import { updateOpsDailyChecklistItem } from "@/lib/ops-board/ops-board-state";
import { createTodayChecklist } from "@/lib/ops-board/ops-board-utils";
import { commitOpsBoardChange } from "@/lib/ops-board/ops-board-sync-client";
import { AdminEmptyState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import {
  OPS_TOOLS_CHECKLIST_CATEGORY_KEYS,
  OPS_TOOLS_CHECKLIST_STATUS_KEYS,
  OPS_TOOLS_PRIORITY_KEYS,
  OPS_TOOLS_SURFACE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterDate } from "@/components/admin/sync-list/AdminFilterSelect";
import { AdminDetailDrawer } from "@/components/admin/ui/AdminDetailDrawer";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";

const DATE_EXTRAS = ["date"] as const;

export function OpsChecklistTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [busy, setBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: false; code: string } | null>(null);
  /** 점검 일자는 주소(`?date=`)에 보존 (R7). 비우면 오늘(PHT). */
  const lq = useAdminListQuery({ extras: DATE_EXTRAS });
  const checklistDate = lq.query.extras.date || formatAdminManilaDate(new Date());
  /** 행 버튼은 2개까지(완료·상세) — 진행·건너뜀은 상세 드로어에서 (설계 2-2). */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const items = useMemo(
    () => getOpsDailyChecklistItems(checklistDate),
    [checklistDate, refresh]
  );

  const detailItem = detailId ? items.find((x) => x.id === detailId) ?? null : null;

  /** 저장 실패면 commitOpsBoardChange 가 화면 상태를 되돌리고, 실패 문구를 표시한다. */
  const commit = async (mutate: () => void) => {
    setBusy(true);
    const r = await commitOpsBoardChange(mutate);
    setBusy(false);
    setSaveResult(r.ok ? null : { ok: false, code: r.error ?? "save_failed" });
    setRefresh((n) => n + 1);
  };

  const handleStatusChange = (id: string, status: OpsChecklistItemStatus) => {
    void commit(() =>
      updateOpsDailyChecklistItem(id, {
        status,
        checkedAt: status === "done" ? new Date().toISOString() : null,
      })
    );
  };

  const handleCreateFromTemplates = () => {
    void commit(() => {
      createTodayChecklist(checklistDate);
    });
  };

  return (
    <div className="space-y-4">
      <AdminResultBanner ko={ko} result={saveResult} onClose={() => setSaveResult(null)} />
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
        pending={busy}
      >
        <AdminFilterDate
          label={t("admin_ops_tools_board_check_date")}
          name="date"
          value={checklistDate}
          onChange={(v) => lq.setExtra("date", v)}
        />
      </AdminFilterBar>
      <div className="flex justify-end">
        {/* 필터 바 [조회] 가 화면 주 동작 — 생성은 보조 */}
        <AdminActionButton variant="secondary" disabled={busy} onClick={handleCreateFromTemplates}>
          {t("admin_ops_tools_board_gen_checklist")}
        </AdminActionButton>
      </div>
      {items.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_ops_tools_board_no_checklist")} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[640px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_title")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_category")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_priority")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_status")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_owner")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_ops_tools_board_th_actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">
                    {i.title}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {t(opsToolsLabel(OPS_TOOLS_CHECKLIST_CATEGORY_KEYS, i.category))} /{" "}
                    {t(opsToolsLabel(OPS_TOOLS_SURFACE_KEYS, i.surface))}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {t(opsToolsLabel(OPS_TOOLS_PRIORITY_KEYS, i.priority))}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                        i.status === "done"
                          ? "bg-sam-success-soft text-sam-success"
                          : i.status === "in_progress"
                            ? "bg-sam-warning-soft text-sam-warning"
                            : "bg-sam-surface-muted text-sam-muted"
                      }`}
                    >
                      {t(opsToolsLabel(OPS_TOOLS_CHECKLIST_STATUS_KEYS, i.status))}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {i.assignedAdminNickname ?? "-"}
                  </td>
                  <td className="px-3 py-2.5">
                    {i.status !== "done" && i.status !== "skipped" && (
                      <div className="flex gap-1">
                        <AdminActionButton
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleStatusChange(i.id, "done")}
                        >
                          {t("admin_ops_tools_board_btn_complete")}
                        </AdminActionButton>
                        <AdminActionButton variant="ghost" size="sm" disabled={busy} onClick={() => setDetailId(i.id)}>
                          {adminCta("detail", ko)}
                        </AdminActionButton>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AdminDetailDrawer
        open={detailItem != null}
        onClose={() => setDetailId(null)}
        ko={ko}
        pending={busy}
        title={detailItem?.title ?? ""}
        subtitle={detailItem ? t(opsToolsLabel(OPS_TOOLS_CHECKLIST_STATUS_KEYS, detailItem.status)) : undefined}
        dangerActions={
          <AdminActionButton variant="secondary" disabled={busy} onClick={() => setDetailId(null)}>
            {adminCta("close", ko)}
          </AdminActionButton>
        }
        primaryActions={
          detailItem && detailItem.status !== "done" && detailItem.status !== "skipped" ? (
            <>
              <AdminActionButton
                variant="secondary"
                disabled={busy}
                onClick={() => handleStatusChange(detailItem.id, "skipped")}
              >
                {t("admin_ops_tools_board_btn_skip")}
              </AdminActionButton>
              {detailItem.status !== "in_progress" ? (
                <AdminActionButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() => handleStatusChange(detailItem.id, "in_progress")}
                >
                  {t("admin_ops_tools_board_btn_progress")}
                </AdminActionButton>
              ) : null}
              <AdminActionButton
                variant="primary"
                disabled={busy}
                onClick={() => handleStatusChange(detailItem.id, "done")}
              >
                {t("admin_ops_tools_board_btn_complete")}
              </AdminActionButton>
            </>
          ) : null
        }
      >
        {detailItem ? (
          <dl className="space-y-2 sam-text-body">
            <div>
              <dt className="text-sam-muted">{t("admin_ops_tools_board_th_category")}</dt>
              <dd className="text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_CHECKLIST_CATEGORY_KEYS, detailItem.category))} /{" "}
                {t(opsToolsLabel(OPS_TOOLS_SURFACE_KEYS, detailItem.surface))}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_ops_tools_board_th_priority")}</dt>
              <dd className="text-sam-fg">{t(opsToolsLabel(OPS_TOOLS_PRIORITY_KEYS, detailItem.priority))}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("admin_ops_tools_board_th_owner")}</dt>
              <dd className="text-sam-fg">{detailItem.assignedAdminNickname ?? "-"}</dd>
            </div>
          </dl>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}

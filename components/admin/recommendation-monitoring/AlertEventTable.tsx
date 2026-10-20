"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getRecommendationAlertEvents,
  acknowledgeAlertEvent,
} from "@/lib/recommendation-ops/recommendation-runtime-state";
import { commitRecommendationRuntimeChange } from "@/lib/recommendation-ops/recommendation-runtime-sync-client";
import { AdminEmptyState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { adminPaginationPageCount, clampAdminPage } from "@/lib/admin/pagination/admin-pagination-window";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import {
  recAlertSeverityLabel,
  recSurfaceLabel,
} from "@/components/admin/recommendation-admin-i18n";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

const ADMIN_ID = "admin1";

export function AlertEventTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: false; code: string } | null>(null);
  /** 확인 여부 필터 — 주소 `?status=ack|unack` 보존 (R7) */
  const lq = useAdminListQuery({ statuses: ["ack", "unack"] });
  const ackFilter: boolean | "" = lq.query.status === "" ? "" : lq.query.status === "ack";

  /** 보관된 알림 전체(번들) 중 필터 결과 → 화면 쪽 나눔 20/50/100 (R7 — 예전: 최신 50건만). */
  const allEvents = useMemo(
    () =>
      getRecommendationAlertEvents({
        isAcknowledged: ackFilter === "" ? undefined : ackFilter,
        limit: null,
      }),
    [refresh, ackFilter]
  );
  const total = allEvents.length;
  const page = clampAdminPage(lq.query.page, adminPaginationPageCount(total, lq.query.size));
  const events = allEvents.slice((page - 1) * lq.query.size, page * lq.query.size);

  /** 저장 실패 → 확인 처리 되돌림 + 실패 문구 (예전: console.warn 만). */
  const handleAck = async (id: string) => {
    setBusy(true);
    const r = await commitRecommendationRuntimeChange(() => acknowledgeAlertEvent(id, ADMIN_ID));
    setBusy(false);
    setSaveResult(r.ok ? null : { ok: false, code: r.error ?? "save_failed" });
    setRefresh((n) => n + 1);
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
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          options: [
            { value: "", label: t("admin_rec_filter_all") },
            { value: "unack", label: t("admin_rec_filter_unack") },
            { value: "ack", label: t("admin_rec_filter_ack") },
          ],
        }}
      />
      {events.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={ackFilter === "" ? t("admin_rec_mon_empty_alert_events") : undefined}
          onReset={ackFilter === "" ? undefined : lq.reset}
        />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_datetime")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_surface")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_severity")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_message")}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_ack")}
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {formatAdminManilaDateTime(e.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {recSurfaceLabel(t, e.surface)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                        e.severity === "critical"
                          ? "bg-sam-danger-soft text-sam-danger"
                          : "bg-sam-warning-soft text-sam-warning"
                      }`}
                    >
                      {recAlertSeverityLabel(t, e.severity)}
                    </span>
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-sam-fg">
                    {e.message}
                  </td>
                  <td className="px-3 py-2.5">
                    {e.isAcknowledged ? (
                      <span className="sam-text-body-secondary text-sam-muted">
                        {t("admin_rec_mon_acknowledged")}
                        {e.acknowledgedAt &&
                          ` ${formatAdminManilaDateTime(e.acknowledgedAt)}`}
                      </span>
                    ) : (
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAck(e.id)}
                      >
                        {t("common_confirm")}
                      </AdminActionButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 ? (
        <AdminPagination
          ko={ko}
          page={page}
          size={lq.query.size}
          total={total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={busy}
        />
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getRecommendationAlertEvents,
  acknowledgeAlertEvent,
} from "@/lib/recommendation-monitoring/mock-recommendation-alert-events";
import { persistRecommendationRuntimeToServer } from "@/lib/recommendation-ops/recommendation-runtime-sync-client";
import {
  recAlertSeverityLabel,
  recSurfaceLabel,
} from "@/components/admin/recommendation-admin-i18n";

const ADMIN_ID = "admin1";

export function AlertEventTable() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const [ackFilter, setAckFilter] = useState<boolean | "">("");

  const events = useMemo(
    () =>
      getRecommendationAlertEvents({
        isAcknowledged: ackFilter === "" ? undefined : ackFilter,
        limit: 50,
      }),
    [refresh, ackFilter]
  );

  const handleAck = async (id: string) => {
    acknowledgeAlertEvent(id, ADMIN_ID);
    setRefresh((r) => r + 1);
    const r = await persistRecommendationRuntimeToServer();
    if (!r.ok) console.warn("[alert-event] persist failed", r.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={ackFilter === "" ? "" : ackFilter ? "ack" : "unack"}
          onChange={(e) => {
            const v = e.target.value;
            setAckFilter(v === "" ? "" : v === "ack");
          }}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">{t("admin_rec_filter_all")}</option>
          <option value="unack">{t("admin_rec_filter_unack")}</option>
          <option value="ack">{t("admin_rec_filter_ack")}</option>
        </select>
      </div>
      {events.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rec_mon_empty_alert_events")}
        </div>
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
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {recSurfaceLabel(t, e.surface)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                        e.severity === "critical"
                          ? "bg-red-50 text-red-800"
                          : "bg-amber-50 text-amber-800"
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
                          ` ${new Date(e.acknowledgedAt).toLocaleString()}`}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAck(e.id)}
                        className="rounded border border-sam-border bg-sam-app px-2 py-1 sam-text-body-secondary text-sam-fg"
                      >
                        {t("common_confirm")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

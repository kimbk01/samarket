"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type AuditLogRow = {
  id: string;
  action_type: string;
  actor_label?: string;
  previous_status: string | null;
  next_status: string | null;
  previous_assignee_label?: string;
  next_assignee_label?: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function DeliveryAlertLogTimeline({ eventId }: { eventId: string }) {
  const { t } = useI18n();
  const dash = t("admin_del_common_dash");
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const load = useCallback(() => {
    setState("loading");
    void fetch(
      `/api/admin/delivery-operation-alerts/events/${encodeURIComponent(eventId)}/logs?order=asc&limit=100`,
      { cache: "no-store", credentials: "include" }
    )
      .then(async (res) => {
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          setState("error");
          setLogs([]);
          return;
        }
        const list = Array.isArray(j?.logs) ? j.logs : [];
        setLogs(list.filter((x: unknown): x is AuditLogRow => x != null && typeof x === "object"));
        setState("ready");
      })
      .catch(() => {
        setState("error");
        setLogs([]);
      });
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading" || state === "idle") {
    return <p className="sam-text-xxs text-sam-muted">{t("admin_del_alert_log_loading")}</p>;
  }
  if (state === "error") {
    return <p className="sam-text-xxs text-sam-warning">{t("admin_del_alert_log_error")}</p>;
  }

  if (!logs.length) {
    return <p className="sam-text-xxs text-sam-muted">{t("admin_del_alert_log_empty")}</p>;
  }

  return (
    <ol className="space-y-2 border-l border-sam-border pl-3 sam-text-xxs text-sam-muted">
      {logs.map((log) => (
        <li key={log.id} className="relative">
          <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-signature/60" aria-hidden />
          <div className="text-sam-fg">
            <span className="font-medium">{log.action_type}</span>
            {log.action_type === "auto_action" && typeof log.metadata?.auto_action_type === "string" ? (
              <span className="ml-1 font-normal text-signature">({String(log.metadata.auto_action_type)})</span>
            ) : null}
            {log.actor_label ? <span className="ml-2 text-signature">· {log.actor_label}</span> : null}
            <span className="ml-2 whitespace-nowrap tabular-nums text-sam-muted">
              {log.created_at.slice(0, 19).replace("T", " ")}
            </span>
          </div>
          <div className="mt-0.5">
            {(log.previous_status || log.next_status) && (
              <span>
                {t("admin_del_alert_log_status_change", {
                  prev: log.previous_status ?? dash,
                  next: log.next_status ?? dash,
                })}
              </span>
            )}
            {(log.previous_assignee_label || log.next_assignee_label) && (
              <span className="ml-2">
                {t("admin_del_alert_log_assignee_change", {
                  prev: log.previous_assignee_label || dash,
                  next: log.next_assignee_label || dash,
                })}
              </span>
            )}
          </div>
          {log.note ? <p className="mt-1 whitespace-pre-wrap text-sam-fg">{log.note}</p> : null}
          {log.metadata && Object.keys(log.metadata).length > 0 ? (
            <pre className="mt-1 max-h-24 overflow-auto rounded bg-sam-surface-muted/50 p-2 font-mono text-[10px] text-sam-muted">
              {JSON.stringify(log.metadata)}
            </pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

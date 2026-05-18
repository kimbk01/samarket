"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AUDIT_TARGET_TYPE_LABEL_KEYS } from "@/lib/admin-audit/admin-audit-i18n-keys";
import { AdminAuditJsonViewer } from "./AdminAuditJsonViewer";

type AuditDetailLog = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  target_type: string;
  target_id: string | null;
  action: string;
  before_json: unknown;
  after_json: unknown;
  ip: string | null;
  user_agent?: string | null;
  created_at: string;
};

function getRelatedHref(log: AuditDetailLog): string | null {
  switch (log.target_type) {
    case "product":
      return log.target_id ? `/admin/products/${log.target_id}` : null;
    case "user":
    case "user_settings":
      return log.target_id ? `/admin/users/${log.target_id}` : null;
    case "chat":
      return log.target_id ? `/admin/chats/${log.target_id}` : null;
    case "report":
      return log.target_id ? `/admin/reports/${log.target_id}` : null;
    case "review":
      return log.target_id ? `/admin/reviews/${log.target_id}` : null;
    case "setting":
      return "/admin/settings";
    case "store_order":
      return "/admin/orders";
    default:
      return null;
  }
}

function auditLocale(language: string): string {
  if (language === "en") return "en-US";
  return "ko-KR";
}

interface AdminAuditDetailPageProps {
  logId: string;
}

export function AdminAuditDetailPage({ logId }: AdminAuditDetailPageProps) {
  const { t, language } = useI18n();
  const locale = auditLocale(language);
  const [log, setLog] = useState<AuditDetailLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/audit-logs/${encodeURIComponent(logId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          log?: AuditDetailLog;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json?.ok || !json.log) {
          setError(json?.error ?? "not_found");
          setLog(null);
          return;
        }
        setError(null);
        setLog(json.log);
      } catch {
        if (!cancelled) {
          setError("network_error");
          setLog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logId]);

  const relatedHref = log ? getRelatedHref(log) : null;
  const targetTypeKey = log
    ? AUDIT_TARGET_TYPE_LABEL_KEYS[log.target_type]
    : undefined;

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_audit_detail_title" backHref="/admin/audit-logs" />
      {loading ? (
        <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_dashboard_loading")}</div>
      ) : null}
      {!loading && error ? (
        <div className="rounded-ui-rect border border-red-100 bg-red-50 px-4 py-5 sam-text-body text-red-700">
          {t("admin_audit_load_failed")}
        </div>
      ) : null}
      {!loading && !error && !log ? (
        <div className="py-8 text-center sam-text-body text-sam-muted">{t("admin_audit_not_found")}</div>
      ) : null}
      {log ? (
        <>
          <AdminCard titleKey="admin_audit_card_basic">
            <dl className="grid gap-2 sam-text-body">
              <div>
                <dt className="text-sam-muted">{t("admin_report_dt_id")}</dt>
                <dd className="font-medium text-sam-fg">{log.id}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_report_dt_type")}</dt>
                <dd>{targetTypeKey ? t(targetTypeKey) : log.target_type}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_audit_dt_action")}</dt>
                <dd>{log.action}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_audit_dt_actor")}</dt>
                <dd>{log.actor_id ? `${log.actor_type} (${log.actor_id})` : log.actor_type}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_report_dt_target")}</dt>
                <dd>{log.target_id ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">IP</dt>
                <dd className="text-sam-fg">{log.ip ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_audit_dt_datetime")}</dt>
                <dd>{new Date(log.created_at).toLocaleString(locale)}</dd>
              </div>
              {log.user_agent ? (
                <div>
                  <dt className="text-sam-muted">User-Agent</dt>
                  <dd className="break-all text-sam-fg">{log.user_agent}</dd>
                </div>
              ) : null}
            </dl>
          </AdminCard>

          {(log.before_json !== undefined || log.after_json !== undefined) && (
            <AdminCard titleKey="admin_audit_card_changes">
              <div className="space-y-3">
                <AdminAuditJsonViewer label={t("admin_audit_json_before")} data={log.before_json} />
                <AdminAuditJsonViewer label={t("admin_audit_json_after")} data={log.after_json} />
              </div>
            </AdminCard>
          )}

          {relatedHref && (
            <AdminCard titleKey="admin_audit_card_related">
              <Link
                href={relatedHref}
                className="sam-text-body font-medium text-signature hover:underline"
              >
                {t("admin_audit_go_related")}
              </Link>
            </AdminCard>
          )}
        </>
      ) : null}
    </div>
  );
}

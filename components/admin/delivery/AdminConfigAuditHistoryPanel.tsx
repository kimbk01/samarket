"use client";

/**
 * 배달 설정·구성 「처리 이력」 패널 — `audit_logs` 기반 (DEF-2 · DEF-45 · DEF-40).
 * 변경자·시각·사유를 1차 정보로, 이전/이후 원시 값은 기술 정보(접힘)로만 표시한다.
 */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import {
  adminConfigAuditActionKey,
  type AdminConfigAuditRow,
  type AdminConfigAuditScope,
} from "@/lib/admin/audit/admin-config-audit-scopes";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export function AdminConfigAuditHistoryPanel({
  scope,
  targetId,
  refreshToken,
  limit = 50,
}: {
  scope: AdminConfigAuditScope;
  targetId?: string | null;
  /** 값이 바뀌면 다시 불러온다 (저장 성공 후 refetch). */
  refreshToken?: number;
  limit?: number;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [rows, setRows] = useState<AdminConfigAuditRow[] | null>(null);
  const [error, setError] = useState<{ code: string; status?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ scope, limit: String(limit) });
      if (targetId) qs.set("target_id", targetId);
      const res = await fetch(`/api/admin/delivery-config-audit?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; rows?: AdminConfigAuditRow[] };
      if (!res.ok || !j.ok) {
        setRows(null);
        setError({ code: typeof j.error === "string" ? j.error : "load_failed", status: res.status });
        return;
      }
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch {
      setRows(null);
      setError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [scope, targetId, limit]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  return (
    <section data-admin-config-audit={scope} className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-sam-fg">{t("admin_r4c_history_title")}</h2>
          <p className="mt-0.5 sam-text-xxs text-sam-muted">{t("admin_r4c_history_desc")}</p>
        </div>
        <AdminActionButton variant="secondary" size="sm" disabled={loading} onClick={() => void load()}>
          {adminCta("refresh", ko)}
        </AdminActionButton>
      </div>
      {loading && !rows ? (
        <AdminLoadingState ko={ko} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.status} onRetry={() => void load()} />
      ) : !rows || rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_r4c_history_empty")} />
      ) : (
        <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.id} className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-sam-fg">{t(adminConfigAuditActionKey(row.action))}</p>
                <p className="sam-text-xxs tabular-nums text-sam-muted">{formatAdminManilaDateTime(row.created_at)}</p>
              </div>
              <p className="mt-0.5 sam-text-helper text-sam-muted">
                {t("admin_r4c_history_actor")}: {row.actor_label ?? t("admin_r4c_history_actor_system")}
              </p>
              <p className="mt-0.5 sam-text-helper text-sam-fg">
                {t("admin_r4c_history_reason")}: {row.reason ?? t("admin_r4c_history_no_reason")}
              </p>
              <AdminTechDetails ko={ko}>
                <p>
                  {row.action} · {row.target_type} · {row.target_id || "—"} · {row.id}
                </p>
                <p className="mt-1">
                  {t("admin_r4c_history_before")}: {row.before_json ? JSON.stringify(row.before_json) : "—"}
                </p>
                <p className="mt-1">
                  {t("admin_r4c_history_after")}: {row.after_json ? JSON.stringify(row.after_json) : "—"}
                </p>
              </AdminTechDetails>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

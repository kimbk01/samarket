"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";

type Row = Record<string, unknown>;

export function AdminTradeAdPoliciesPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  /** 목록 조회 실패 (오류 코드·HTTP 상태 — 권한 없음 구분) — 직전 목록은 지우지 않는다 */
  const [loadErr, setLoadErr] = useState<{ code: string; httpStatus: number } | null>(null);
  /** 사용/중지 저장 실패 안내 */
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch("/api/admin/trade-ad-products", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: Row[]; error?: string };
      if (!res.ok || !j.ok) {
        setLoadErr({ code: j.error || `http_${res.status}`, httpStatus: res.status });
      } else {
        setRows(j.rows ?? []);
      }
    } catch {
      setLoadErr({ code: "network_error", httpStatus: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (r: Row) => {
    const id = String(r.id ?? "");
    if (!id) return;
    const actionLabel = r.is_active ? t("admin_trade_ad_policies_toggle_off") : t("admin_trade_ad_policies_toggle_on");
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(r.is_active ? "disable" : "resume"),
      ko,
      title: `${String(r.name ?? "")} · ${actionLabel}`,
      confirmLabel: actionLabel,
    });
    if (!confirmed.ok) return;
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/trade-ad-products/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !r.is_active }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ? adminOperatorErrorMessage(j.error, ko) : t("admin_trade_ad_policies_save_failed"));
        return;
      }
      await load();
    } catch {
      setErr(adminOperatorErrorMessage("network_error", ko));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader titleKey="admin_page_trade_ad_policies" descriptionKey="admin_trade_ad_policies_desc" />

      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_trade_ad_policies_apply_prefix")}{" "}
        <Link href="/admin/trade-post-ads" className="text-sam-primary underline">
          {t("admin_trade_ad_policies_apply_link")}
        </Link>{" "}
        {t("admin_trade_ad_policies_apply_suffix")}
      </p>

      {err ? (
        <div role="alert" className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-4 py-3 sam-text-body-secondary text-sam-fg">
          {err}
        </div>
      ) : null}

      {loadErr ? <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={() => void load()} /> : null}

      {rows === null ? (
        loading ? <AdminLoadingState ko={ko} label={t("common_loading")} /> : null
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_trade_ad_policies_empty")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left sam-text-body-secondary">
            <thead className="bg-sam-surface-muted text-sam-muted">
              <tr>
                <th className="px-3 py-2">{t("admin_trade_ad_policies_th_name")}</th>
                <th className="px-3 py-2">board</th>
                <th className="px-3 py-2">placement</th>
                <th className="px-3 py-2">{t("admin_trade_ad_policies_th_service")}</th>
                <th className="px-3 py-2">{t("admin_trade_ad_policies_th_duration_days")}</th>
                <th className="px-3 py-2">{t("admin_trade_th_points")}</th>
                <th className="px-3 py-2">{t("admin_trade_ad_policies_th_priority")}</th>
                <th className="px-3 py-2">{t("admin_trade_ad_policies_th_active")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = String(r.id ?? "");
                return (
                  <tr key={id} className="border-t border-sam-border-soft">
                    <td className="px-3 py-2 font-medium text-sam-fg">{String(r.name ?? "")}</td>
                    <td className="px-3 py-2">{String(r.board_key ?? "—")}</td>
                    <td className="px-3 py-2">{String(r.placement ?? "—")}</td>
                    <td className="px-3 py-2">{String(r.service_type ?? t("admin_trade_ad_policies_service_all"))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatAdminNumber(r.duration_days as number | string | null | undefined)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatAdminNumber(r.point_cost as number | string | null | undefined)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatAdminNumber(r.priority_default as number | string | null | undefined)}</td>
                    <td className="px-3 py-2">
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        disabled={busyId === id}
                        onClick={() => void toggleActive(r)}
                      >
                        {r.is_active ? t("admin_trade_ad_policies_toggle_off") : t("admin_trade_ad_policies_toggle_on")}
                      </AdminActionButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

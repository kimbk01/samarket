"use client";

/**
 * 이력 「삭제됨」 목록 + 「삭제 취소」 (설계 §3-2 · A-2 · R2 · 2026-11-07).
 * 삭제 취소 = L2(사유 · 재입력 없음) — 삭제 표시만 되돌리고 종료·환급은 되돌리지 않는다.
 * 권한 = 권한 표(`adminAdKindWriteRequirement`) — 없으면 버튼이 꺼지고 이유를 보인다. 서버가 다시 막는다.
 */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminAccessActor } from "@/components/admin/access/use-admin-route-access";
import { describeAdminRequirementDenial } from "@/lib/admin/access/admin-access-ui";
import { actorMeetsAdminRouteRequirement } from "@/lib/admin/access/admin-route-access";
import { adminAdKindWriteRequirement } from "@/lib/admin/access/admin-ads-authority";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import {
  adminAdDeleteErrorMessageKey,
  adminAdKindLabelKey,
  type AdminAdDeletedRow,
} from "@/lib/admin/ads-delete/admin-ad-delete-contract";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import type { AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";

export function AdminAdsDeletedList({
  page,
  size,
  onPageChange,
  onSizeChange,
}: {
  page: number;
  size: AdminListPageSize;
  onPageChange: (p: number) => void;
  onSizeChange: (s: AdminListPageSize) => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const { actor } = useAdminAccessActor();
  const [rows, setRows] = useState<AdminAdDeletedRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setErr("");
    try {
      const qs = new URLSearchParams({ limit: String(size), offset: String((page - 1) * size) });
      const res = await fetch(`/api/admin/ads/deleted?${qs.toString()}`, { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; rows?: AdminAdDeletedRow[]; total?: number };
      if (!res.ok || !json.ok) {
        setErr(json.error || "load_failed");
        return;
      }
      setRows(json.rows ?? []);
      setTotal(Number(json.total ?? 0));
    } catch {
      setErr("network_error");
    }
    // reloadKey — 삭제 취소 뒤 다시 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const undelete = async (row: AdminAdDeletedRow) => {
    const title = row.title ?? t(adminAdKindLabelKey(row.kind));
    const c = await confirmAdminAction({
      action: "adUndelete",
      ko,
      title: t("admin_ad_undelete_title", { title }),
      description: t("admin_ad_undelete_description"),
      confirmLabel: t("admin_ad_undelete_confirm"),
    });
    if (!c.ok) return;
    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/ads/undelete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: row.kind, id: row.id, reason: c.reason }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        await dibayAlert({ title: t(adminAdDeleteErrorMessageKey(json.error ?? null)) });
        return;
      }
      await dibayAlert({ title: t("admin_ad_undelete_done") });
      setReloadKey((k) => k + 1);
    } finally {
      setBusyId(null);
    }
  };

  if (err) return <AdminErrorState ko={ko} code={err} onRetry={() => void load()} />;
  if (!rows) return <AdminLoadingState ko={ko} />;

  return (
    <div className="space-y-3" data-ads-history-deleted="1">
      <p className="text-[12px] text-sam-muted">{t("admin_ads_history_deleted_note")}</p>
      {rows.length === 0 && page <= 1 ? (
        <AdminEmptyState ko={ko} message={t("admin_ads_history_deleted_empty")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface px-3">
          <table className="w-full min-w-[48rem] border-collapse text-left sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                <th className="py-2 pr-2 font-medium">{t("admin_ads_history_deleted_col_at")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_ads_history_deleted_col_kind")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_ads_history_deleted_col_title")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_ads_history_deleted_col_reason")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_ads_history_deleted_col_action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const req = adminAdKindWriteRequirement(row.kind);
                const denied =
                  actor && !actorMeetsAdminRouteRequirement(req, actor)
                    ? describeAdminRequirementDenial(req, language)
                    : null;
                return (
                  <tr
                    key={`${row.kind}:${row.id}`}
                    className="border-b border-sam-border/70 align-top"
                    data-ads-history-deleted-row={row.id}
                    data-ads-history-deleted-kind={row.kind}
                  >
                    <td className="whitespace-nowrap py-2 pr-2 text-[12px] text-sam-muted">
                      {formatAdminManilaDateTime(row.deletedAt)}
                    </td>
                    <td className="py-2 pr-2 text-sam-fg">{t(adminAdKindLabelKey(row.kind))}</td>
                    <td className="max-w-[16rem] py-2 pr-2 text-sam-fg">
                      <p className="truncate">{row.title ?? "—"}</p>
                    </td>
                    <td className="max-w-[16rem] py-2 pr-2 text-[12px] text-sam-muted">{row.deleteReason ?? "—"}</td>
                    <td className="py-2 pr-2">
                      <AdminActionButton
                        variant="secondary"
                        size="sm"
                        disabled={Boolean(denied) || busyId === row.id}
                        title={denied ?? undefined}
                        onClick={() => void undelete(row)}
                        data-ads-history-undelete="1"
                      >
                        {t("admin_ad_undelete_button")}
                      </AdminActionButton>
                      {denied ? <p className="mt-0.5 text-[12px] text-sam-muted">{denied}</p> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 || page > 1 ? (
        <AdminPagination ko={ko} page={page} size={size} total={total} onPageChange={onPageChange} onSizeChange={onSizeChange} />
      ) : null}
    </div>
  );
}

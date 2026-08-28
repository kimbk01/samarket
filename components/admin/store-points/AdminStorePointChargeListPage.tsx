"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import { parseAdminStorePointChargeFocusRequestId } from "@/lib/admin/admin-point-charge-deeplink";
import { isPendingChargeStatus } from "@/lib/stores/owner-point-deposit-context";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  point_balance: number;
  point_amount: number;
  payment_amount: number;
  request_status: string;
  depositor_name: string;
  requested_at: string;
};

const STATUS_KEYS: Record<string, MessageKey> = {
  pending: "admin_store_point_charge_status_pending",
  waiting_confirm: "admin_store_point_charge_status_waiting",
  approved: "admin_store_point_charge_status_approved",
  rejected: "admin_store_point_charge_status_rejected",
  on_hold: "admin_store_point_charge_status_hold",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  waiting_confirm: "bg-blue-100 text-blue-900",
  approved: "bg-[#006241]/15 text-[#006241]",
  rejected: "bg-red-100 text-red-800",
  on_hold: "bg-orange-100 text-orange-900",
};

export function AdminStorePointChargeListPage() {
  const { t } = useI18n();
  const { refresh: refreshPendingCount } = useAdminStorePointPendingCount();
  const searchParams = useSearchParams();
  const filterStoreId = searchParams.get("storeId")?.trim() ?? "";
  const focusRequestId = parseAdminStorePointChargeFocusRequestId(searchParams);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const loadUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (filterStoreId) qs.set("storeId", filterStoreId);
    const q = qs.toString();
    return q ? `/api/admin/store-point-charges?${q}` : "/api/admin/store-point-charges";
  }, [filterStoreId]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(loadUrl, { credentials: "include" });
      const json = (await res.json()) as { requests?: Row[]; ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_store_point_action_failed"));
        setRows([]);
        return;
      }
      setRows(json?.requests ?? []);
    } catch {
      setErr(t("common_network_error"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [loadUrl, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusRequestId || loading) return;
    const el = document.getElementById(`admin-store-point-charge-${focusRequestId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusRequestId, loading, rows]);

  const patch = async (id: string, action: "approve" | "reject" | "hold") => {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/store-point-charges/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_store_point_action_failed"));
        return;
      }
      await load();
      void refreshPendingCount();
    } catch {
      setErr(t("common_network_error"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_point_charges" />
      {filterStoreId ? (
        <p className="text-sm text-sam-muted">{t("admin_store_point_charges_filter_store")}</p>
      ) : null}
      {err ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_store_point_charges_empty")}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const statusKey = STATUS_KEYS[r.request_status];
            const badgeClass =
              STATUS_BADGE_CLASS[r.request_status] ?? "bg-sam-app text-sam-muted";
            const focused = focusRequestId === r.id;
            return (
              <article
                key={r.id}
                id={`admin-store-point-charge-${r.id}`}
                data-testid={focused ? "admin-store-point-charge-focus" : undefined}
                className={`rounded-ui-rect border bg-sam-surface p-4 shadow-sm ${
                  focused ? "border-[#006241] ring-2 ring-[#006241]/30" : "border-sam-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-semibold text-sam-fg">{r.store_name || r.store_id}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
                  >
                    {statusKey ? t(statusKey) : t("common_content_unavailable")}
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold tabular-nums text-[#006241]">
                  {r.point_amount.toLocaleString()}P
                </p>
                <p className="text-xs text-sam-muted">
                  {t("admin_store_point_charge_store_balance")}:{" "}
                  {r.point_balance.toLocaleString()}P
                </p>
                <p className="mt-1 text-sm text-sam-fg">
                  {t("admin_store_point_charge_depositor_label")}: {r.depositor_name || "—"}
                </p>
                <p className="text-xs text-sam-muted">{r.requested_at?.slice(0, 19)}</p>

                {isPendingChargeStatus(r.request_status) ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-sam-border-soft pt-3">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-ui-rect bg-[#006241] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      onClick={() => void patch(r.id, "approve")}
                    >
                      {t("admin_store_point_charge_action_approve")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-ui-rect border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
                      onClick={() => void patch(r.id, "reject")}
                    >
                      {t("admin_store_point_charge_action_reject")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-ui-rect border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"
                      onClick={() => void patch(r.id, "hold")}
                    >
                      {t("admin_store_point_charge_action_hold")}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

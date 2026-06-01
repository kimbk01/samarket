"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";
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
  bank_name: string;
  user_memo: string | null;
  admin_memo: string | null;
  receipt_image_url: string | null;
  requested_at: string;
  inquiry_id: string | null;
  inquiry_subject: string;
  inquiry_answer_snippet: string;
};



const STATUS_KEYS: Record<string, MessageKey> = {
  pending: "admin_store_point_charge_status_pending",
  waiting_confirm: "admin_store_point_charge_status_waiting",
  approved: "admin_store_point_charge_status_approved",
  rejected: "admin_store_point_charge_status_rejected",
  on_hold: "admin_store_point_charge_status_hold",
};



export function AdminStorePointChargeListPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const filterStoreId = searchParams.get("storeId")?.trim() ?? "";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [adminMemoDraft, setAdminMemoDraft] = useState<Record<string, string>>({});
  const [memoSavedId, setMemoSavedId] = useState<string | null>(null);



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
      const fetched = json?.requests ?? [];
      setRows(fetched);
      setAdminMemoDraft((prev) => {
        const next = { ...prev };
        for (const r of fetched) {
          if (!(r.id in next) && r.admin_memo) {
            next[r.id] = r.admin_memo;
          }
        }
        return next;
      });
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



  const saveMemo = async (id: string) => {
    setBusyId(id);
    setMemoSavedId(null);
    try {
      const res = await fetch(`/api/admin/store-point-charges/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_memo: adminMemoDraft[id] ?? "" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_store_point_action_failed"));
        return;
      }
      setMemoSavedId(id);
      setTimeout(() => setMemoSavedId(null), 2000);
    } catch {
      setErr(t("common_network_error"));
    } finally {
      setBusyId(null);
    }
  };

  const patch = async (id: string, action: "approve" | "reject" | "hold") => {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/store-point-charges/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, admin_memo: adminMemoDraft[id] }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setErr(resolveAdminApiErrorMessage(json.error, t, "admin_store_point_action_failed"));
        return;
      }
      await load();
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
          {rows.map((r) => (
            <article
              key={r.id}
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-sam-fg">{r.store_name || r.store_id}</span>
                <span className="text-sm text-sam-muted">
                  {STATUS_KEYS[r.request_status]
                    ? t(STATUS_KEYS[r.request_status])
                    : t("common_content_unavailable")}
                </span>
              </div>
              <p className="mt-1 text-sm text-sam-fg">
                {r.point_amount.toLocaleString()}P · {r.payment_amount.toLocaleString()} PHP
              </p>
              <p className="text-xs text-sam-muted">
                {t("admin_store_point_charge_store_balance")}: {r.point_balance.toLocaleString()}P
              </p>
              <p className="text-xs text-sam-muted">
                {r.depositor_name} · {r.bank_name} · {r.requested_at?.slice(0, 19)}
              </p>
              {r.user_memo ? (
                <p className="mt-1 text-xs text-sam-muted">
                  <span className="font-medium">{t("admin_store_point_charge_user_memo")}:</span>{" "}
                  {r.user_memo}
                </p>
              ) : null}
              {r.receipt_image_url ? (
                <p className="mt-1 text-xs">
                  <span className="font-medium text-sam-muted">
                    {t("admin_store_point_charge_receipt_url")}:
                  </span>{" "}
                  <a
                    href={r.receipt_image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#006241] underline"
                  >
                    {r.receipt_image_url.length > 60
                      ? `${r.receipt_image_url.slice(0, 60)}…`
                      : r.receipt_image_url}
                  </a>
                </p>
              ) : null}
              {r.inquiry_subject ? (
                <p className="mt-1 text-xs text-sam-muted">
                  {t("admin_store_point_charge_inquiry_link")}: {r.inquiry_subject}
                  {r.inquiry_answer_snippet ? ` — ${r.inquiry_answer_snippet}` : ""}
                </p>
              ) : null}

              <div className="mt-3 space-y-1 border-t border-sam-border-soft pt-3">
                <label className="block text-xs font-medium text-sam-muted">
                  {t("admin_store_point_charge_admin_memo_label")}
                </label>
                <div className="flex gap-2">
                  <textarea
                    className="min-h-[60px] flex-1 rounded-ui-rect border border-sam-border px-2 py-1.5 text-xs"
                    rows={2}
                    value={adminMemoDraft[r.id] ?? r.admin_memo ?? ""}
                    onChange={(e) =>
                      setAdminMemoDraft((d) => ({ ...d, [r.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="self-start rounded-ui-rect border border-sam-border px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
                    onClick={() => void saveMemo(r.id)}
                  >
                    {memoSavedId === r.id
                      ? t("admin_store_point_charge_memo_saved")
                      : t("admin_store_point_charge_memo_save")}
                  </button>
                </div>
              </div>

              {isPendingChargeStatus(r.request_status) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="rounded-ui-rect bg-[#006241] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() => void patch(r.id, "approve")}
                  >
                    {t("admin_store_point_charge_action_approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-sm font-semibold"
                    onClick={() => void patch(r.id, "reject")}
                  >
                    {t("admin_store_point_charge_action_reject")}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="rounded-ui-rect border border-amber-400 px-3 py-1.5 text-sm font-semibold text-amber-900"
                    onClick={() => void patch(r.id, "hold")}
                  >
                    {t("admin_store_point_charge_action_hold")}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}



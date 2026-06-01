"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";

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
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/store-point-charges", { credentials: "include" });
      const json = await res.json();
      setRows(json?.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (id: string, action: "approve" | "reject" | "hold") => {
    setBusyId(id);
    try {
      await fetch(`/api/admin/store-point-charges/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_point_charges" />

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
              {r.inquiry_subject ? (
                <p className="mt-1 text-xs text-sam-muted">
                  {t("admin_store_point_charge_inquiry_link")}: {r.inquiry_subject}
                  {r.inquiry_answer_snippet ? ` — ${r.inquiry_answer_snippet}` : ""}
                </p>
              ) : null}
              {r.request_status === "pending" || r.request_status === "waiting_confirm" ? (
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

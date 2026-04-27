"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdProduct, AdType } from "@/lib/ads/types";

const AD_TYPE_KEYS: Record<AdType, MessageKey> = {
  top_fixed: "admin_ad_type_top_fixed",
  mid_insert: "admin_ad_type_mid_insert",
  highlight: "admin_ad_type_highlight",
};

interface AdProductTableProps {
  products: AdProduct[];
}

export function AdProductTable({ products }: AdProductTableProps) {
  const { t: tr } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<AdProduct>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const headers: MessageKey[] = [
    "admin_ad_products_col_name",
    "admin_ad_products_col_board",
    "admin_ad_products_col_type",
    "admin_ad_products_col_duration",
    "admin_ad_products_col_points",
    "admin_ad_products_col_priority",
    "admin_ad_products_col_active",
    "admin_ad_products_col_manage",
  ];

  const startEdit = (p: AdProduct) => {
    setEditing(p.id);
    setForm({ ...p });
  };

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/ad-products/${editing}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? tr("admin_ad_products_err_save"));
        return;
      }
      setEditing(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (products.length === 0) {
    return <p className="py-8 text-center sam-text-body-secondary text-sam-muted">{tr("admin_ad_products_empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      {err ? (
        <p className="mb-2 rounded bg-red-50 px-3 py-2 sam-text-helper text-red-700">{err}</p>
      ) : null}
      <table className="w-full min-w-[700px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            {headers.map((key) => (
              <th key={key} className="px-3 py-2 text-left font-semibold text-sam-muted">
                {tr(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const isEditing = editing === p.id;
            return (
              <tr key={p.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      type="text"
                      value={form.name ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-40 rounded border border-sam-border px-2 py-1 sam-text-helper"
                    />
                  ) : (
                    <span className="font-medium text-sam-fg">{p.name}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-sam-muted">{p.boardKey ?? tr("admin_ad_products_board_all")}</td>
                <td className="px-3 py-2 text-sam-muted">{tr(AD_TYPE_KEYS[p.adType])}</td>
                <td className="px-3 py-2 text-sam-muted">
                  {isEditing ? (
                    <input
                      type="number"
                      value={form.durationDays ?? 3}
                      min={1}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, durationDays: Number(e.target.value) }))
                      }
                      className="w-16 rounded border border-sam-border px-2 py-1 sam-text-helper"
                    />
                  ) : (
                    tr("admin_ad_products_duration_days", { days: p.durationDays })
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? (
                    <input
                      type="number"
                      value={form.pointCost ?? 10000}
                      min={0}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, pointCost: Number(e.target.value) }))
                      }
                      className="w-20 rounded border border-sam-border px-2 py-1 sam-text-helper"
                    />
                  ) : (
                    `${p.pointCost.toLocaleString()}P`
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? (
                    <input
                      type="number"
                      value={form.priorityDefault ?? 100}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priorityDefault: Number(e.target.value) }))
                      }
                      className="w-16 rounded border border-sam-border px-2 py-1 sam-text-helper"
                    />
                  ) : (
                    p.priorityDefault
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      type="checkbox"
                      checked={form.isActive ?? true}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    />
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 sam-text-xxs font-semibold ${
                        p.isActive ? "bg-emerald-100 text-emerald-800" : "bg-sam-surface-muted text-sam-muted"
                      }`}
                    >
                      {p.isActive ? tr("admin_ad_products_status_active") : tr("admin_ad_products_status_inactive")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save()}
                        className="rounded bg-sky-600 px-2 py-1 sam-text-xxs font-semibold text-white disabled:opacity-50"
                      >
                        {tr("common_save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs text-sam-muted"
                      >
                        {tr("common_cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="rounded border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs text-sam-fg hover:bg-sam-app"
                    >
                      {tr("admin_ad_products_btn_edit")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

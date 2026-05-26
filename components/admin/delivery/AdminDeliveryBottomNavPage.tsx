"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  BOTTOM_NAV_BUILTIN_ICON_KEYS,
  resolveAdminDelApiError,
} from "@/components/admin/i18n/admin-delivery-label-keys";
import { isDeliveryBottomNavBuiltinOwnerStoreItem } from "@/lib/delivery/load-delivery-bottom-nav-items-server";

type Row = {
  id: string;
  label: string;
  icon_key: string;
  href: string;
  sort_order: number;
  is_active: boolean;
  is_center: boolean;
  color: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type ListResp = { ok: boolean; items?: Row[]; error?: string };

async function apiList(): Promise<ListResp> {
  const res = await fetch("/api/admin/stores/bottom-nav", { credentials: "include" });
  return (await res.json()) as ListResp;
}

async function apiCreate(payload: Partial<Row>) {
  const res = await fetch("/api/admin/stores/bottom-nav", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as { ok: boolean; item?: Row; error?: string };
}

async function apiUpdate(id: string, patch: Partial<Row>) {
  const res = await fetch("/api/admin/stores/bottom-nav", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  return (await res.json()) as { ok: boolean; item?: Row; error?: string };
}

async function apiDelete(id: string) {
  const res = await fetch(`/api/admin/stores/bottom-nav?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return (await res.json()) as { ok: boolean; error?: string };
}

function normalizeInt(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export function AdminDeliveryBottomNavPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Row> | null>(null);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<Partial<Row>>({
    label: "",
    icon_key: "home",
    href: "/philife",
    sort_order: 0,
    is_active: true,
    is_center: false,
    color: "#0B421A",
  });

  const tableHeaders = useMemo(
    () =>
      [
        "admin_del_th_order",
        "admin_del_th_menu_name",
        "admin_del_th_icon_key",
        "admin_del_th_link",
        "admin_del_th_visible",
        "admin_del_th_center",
        "admin_del_th_color",
        "admin_del_th_manage",
      ] as const,
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiList();
      if (!data.ok) {
        setError(resolveAdminDelApiError(t, data.error));
        setRows([]);
      } else {
        const sorted = (data.items ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        setRows(sorted.filter((r) => !isDeliveryBottomNavBuiltinOwnerStoreItem(r)));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const centerCount = useMemo(() => rows.filter((r) => r.is_center).length, [rows]);
  const editingRow = useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) ?? null : null),
    [editingId, rows]
  );

  const move = useCallback(
    async (id: string, dir: "up" | "down") => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) return;
      const nextIdx = dir === "up" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= rows.length) return;
      const a = rows[idx]!;
      const b = rows[nextIdx]!;
      await apiUpdate(a.id, { sort_order: b.sort_order });
      await apiUpdate(b.id, { sort_order: a.sort_order });
      await load();
    },
    [rows, load]
  );

  const enterEdit = useCallback((r: Row) => {
    setError(null);
    setEditingId(r.id);
    setEditDraft({
      label: r.label,
      icon_key: r.icon_key,
      href: r.href,
      color: r.color,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft(null);
    setError(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingRow || !editingId || !editDraft) return;
    const label = String(editDraft.label ?? "").trim();
    const icon_key = String(editDraft.icon_key ?? "").trim();
    const href = String(editDraft.href ?? "").trim();
    const color = String(editDraft.color ?? "").trim() || "#0B421A";
    if (!label || !icon_key || !href) {
      setError(t("admin_del_err_required_fields"));
      return;
    }
    setSaving(true);
    try {
      const patch: Partial<Row> = {};
      if (label !== editingRow.label) patch.label = label;
      if (icon_key !== editingRow.icon_key) patch.icon_key = icon_key;
      if (href !== editingRow.href) patch.href = href;
      if (color !== editingRow.color) patch.color = color;
      if (Object.keys(patch).length > 0) {
        const res = await apiUpdate(editingId, patch);
        if (!res.ok) {
          setError(resolveAdminDelApiError(t, res.error));
          return;
        }
      }
      cancelEdit();
      await load();
    } finally {
      setSaving(false);
    }
  }, [editingRow, editingId, editDraft, cancelEdit, load, t]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <AdminPageHeader
        titleKey="admin_del_page_bottom_nav_title"
        descriptionKey="admin_del_page_bottom_nav_desc"
      />

      <div className="grid gap-4">
        <AdminCard titleKey="admin_del_card_add_menu" className="">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">{t("admin_del_field_label")}</span>
              <input
                className="sam-input"
                value={draft.label ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
                placeholder={t("admin_del_ph_label_example")}
              />
            </label>
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">{t("admin_del_field_icon_key")}</span>
              <input
                className="sam-input"
                value={draft.icon_key ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, icon_key: e.target.value }))}
                placeholder={t("admin_del_ph_icon_key")}
              />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="sam-text-body font-medium text-sam-fg">{t("admin_del_field_href")}</span>
              <input
                className="sam-input"
                value={draft.href ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, href: e.target.value }))}
                placeholder={t("admin_del_ph_href")}
              />
            </label>
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">{t("admin_del_field_sort_order")}</span>
              <input
                className="sam-input"
                inputMode="numeric"
                value={String(draft.sort_order ?? 0)}
                onChange={(e) => setDraft((p) => ({ ...p, sort_order: normalizeInt(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">{t("admin_del_field_color")}</span>
              <input
                className="sam-input"
                value={draft.color ?? "#0B421A"}
                onChange={(e) => setDraft((p) => ({ ...p, color: e.target.value }))}
                placeholder={t("admin_del_ph_color")}
              />
            </label>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="inline-flex items-center gap-2 sam-text-body text-sam-fg">
                <input
                  type="checkbox"
                  checked={Boolean(draft.is_active)}
                  onChange={(e) => setDraft((p) => ({ ...p, is_active: e.target.checked }))}
                />
                {t("admin_del_field_is_active")}
              </label>
              <label className="inline-flex items-center gap-2 sam-text-body text-sam-fg">
                <input
                  type="checkbox"
                  checked={Boolean(draft.is_center)}
                  onChange={(e) => setDraft((p) => ({ ...p, is_center: e.target.checked }))}
                />
                {t("admin_del_field_is_center_count", { count: centerCount })}
              </label>
              <button
                className="sam-btn-primary"
                onClick={async () => {
                  setError(null);
                  const res = await apiCreate(draft);
                  if (!res.ok) {
                    setError(resolveAdminDelApiError(t, res.error));
                    return;
                  }
                  setDraft((p) => ({ ...p, label: "" }));
                  await load();
                }}
              >
                {t("admin_del_btn_add")}
              </button>
              <button className="sam-btn" onClick={load}>
                {t("admin_del_common_refresh")}
              </button>
            </div>
            {error ? <p className="sam-text-body text-red-600">{error}</p> : null}
          </div>
        </AdminCard>

        <AdminCard titleKey="admin_del_card_menu_list">
          {loading ? (
            <div className="sam-text-body text-sam-muted">{t("common_loading")}</div>
          ) : (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
              <table className="w-full min-w-[820px] border-collapse sam-text-body">
                <thead>
                  <tr className="border-b border-sam-border bg-sam-app">
                    {tableHeaders.map((key) => (
                      <th
                        key={key}
                        className={`px-3 py-2 font-medium text-sam-fg ${
                          key === "admin_del_th_manage" ? "text-right" : "text-left"
                        } ${key === "admin_del_th_visible" || key === "admin_del_th_center" ? "text-center" : ""}`}
                      >
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const isEditing = editingId === r.id;
                    return (
                      <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app/50">
                        <td className="px-3 py-2 text-sam-muted">{r.sort_order}</td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              className="sam-input !h-9"
                              value={String(editDraft?.label ?? "")}
                              onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), label: e.target.value }))}
                            />
                          ) : (
                            <span className="font-medium text-sam-fg">{r.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <select
                              className="sam-input !h-9"
                              value={String(editDraft?.icon_key ?? "")}
                              onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), icon_key: e.target.value }))}
                            >
                              {BOTTOM_NAV_BUILTIN_ICON_KEYS.map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                              <option value={String(editDraft?.icon_key ?? "")}>
                                {t("admin_del_custom_icon_option", {
                                  key: String(editDraft?.icon_key ?? ""),
                                })}
                              </option>
                            </select>
                          ) : (
                            <span className="sam-text-helper text-sam-muted">{r.icon_key}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              className="sam-input !h-9 min-w-[260px]"
                              value={String(editDraft?.href ?? "")}
                              onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), href: e.target.value }))}
                            />
                          ) : (
                            <span className="sam-text-helper text-sam-muted">{r.href}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => void apiUpdate(r.id, { is_active: !r.is_active }).then(load)}
                            className={`rounded px-1.5 py-0.5 sam-text-helper ${
                              r.is_active ? "text-signature hover:bg-signature/10" : "text-sam-muted hover:bg-sam-border-soft"
                            }`}
                            title={t("admin_del_toggle_visible_title")}
                          >
                            {r.is_active ? t("admin_del_state_on") : t("admin_del_state_off")}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => void apiUpdate(r.id, { is_center: true }).then(load)}
                            className={`rounded px-1.5 py-0.5 sam-text-helper ${
                              r.is_center ? "text-signature hover:bg-signature/10" : "text-sam-muted hover:bg-sam-border-soft"
                            }`}
                            title={t("admin_del_center_only_one_title")}
                          >
                            {r.is_center ? t("admin_del_center_badge") : t("admin_del_normal_badge")}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                className="sam-input !h-9 w-[120px]"
                                value={String(editDraft?.color ?? "")}
                                onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), color: e.target.value }))}
                              />
                              <input
                                type="color"
                                value={String(editDraft?.color ?? "#0B421A")}
                                onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), color: e.target.value }))}
                                className="h-9 w-10 rounded border border-sam-border bg-sam-surface"
                                aria-label={t("admin_del_pick_color_aria")}
                              />
                            </div>
                          ) : (
                            <span className="sam-text-helper text-sam-muted">{r.color}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => void move(r.id, "up")}
                              disabled={idx === 0}
                              className="rounded p-1 text-sam-muted hover:bg-sam-border-soft disabled:opacity-40"
                              title={t("admin_del_move_up_title")}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => void move(r.id, "down")}
                              disabled={idx === rows.length - 1}
                              className="rounded p-1 text-sam-muted hover:bg-sam-border-soft disabled:opacity-40"
                              title={t("admin_del_move_down_title")}
                            >
                              ▼
                            </button>
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void saveEdit()}
                                  className="rounded px-1.5 py-0.5 sam-text-helper text-signature hover:bg-signature/10 disabled:opacity-50"
                                >
                                  {t("common_save")}
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={cancelEdit}
                                  className="rounded px-1.5 py-0.5 sam-text-helper text-sam-muted hover:bg-sam-border-soft disabled:opacity-50"
                                >
                                  {t("common_cancel")}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => enterEdit(r)}
                                className="rounded px-1.5 py-0.5 sam-text-helper text-signature hover:bg-signature/10"
                              >
                                {t("common_edit")}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm(t("admin_del_confirm_delete"))) return;
                                await apiDelete(r.id);
                                if (editingId === r.id) cancelEdit();
                                await load();
                              }}
                              className="rounded px-1.5 py-0.5 sam-text-helper text-red-600 hover:bg-red-50"
                            >
                              {t("common_delete")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BOTTOM_NAV_FONT_PRESET_KEYS,
  BOTTOM_NAV_ICON_ACTIVE_PRESET_KEYS,
  BOTTOM_NAV_ICON_INACTIVE_PRESET_KEYS,
  BOTTOM_NAV_ICON_LABEL_KEYS,
  BOTTOM_NAV_LABEL_ACTIVE_PRESET_KEYS,
  BOTTOM_NAV_LABEL_INACTIVE_PRESET_KEYS,
  BOTTOM_NAV_LABEL_SIZE_PRESET_KEYS,
  BOTTOM_NAV_SAVE_ERROR_KEYS,
  bottomNavPresetLabelKey,
} from "@/components/admin/i18n/admin-menus-label-keys";
import type { BottomNavIconKey, BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import {
  MAIN_BOTTOM_NAV_FONT_FAMILY_PRESETS,
  MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS,
  MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS,
} from "@/lib/main-menu/main-bottom-nav-presets";
import type { MainBottomNavAdminRow } from "@/lib/main-menu/main-bottom-nav-types";
import {
  generateCustomBottomNavTabId,
  isBuiltinBottomNavTabId,
} from "@/lib/main-menu/resolve-main-bottom-nav";
import { notifyMainBottomNavConfigChanged } from "@/lib/app/fetch-main-bottom-nav-deduped";

const ICON_OPTION_KEYS: BottomNavIconKey[] = ["trade", "home", "community", "stores", "chat", "my", "orders"];

const MAX_TABS = 10;

function rowToPayloadItem(row: MainBottomNavAdminRow, defaultLabel: string) {
  return {
    id: row.id,
    visible: row.visible,
    label: row.label.trim() || defaultLabel,
    href: row.href,
    icon: row.icon,
    iconSizeClass: row.iconSizeClass,
    labelInactiveExtraClass: row.labelInactiveExtraClass,
    labelActiveExtraClass: row.labelActiveExtraClass,
    iconInactiveClass: row.iconInactiveClass,
    iconActiveClass: row.iconActiveClass,
    labelInactiveClass: row.labelInactiveClass,
    labelActiveClass: row.labelActiveClass,
    labelSizeClass: row.labelSizeClass,
    labelFontFamilyClass: row.labelFontFamilyClass,
  };
}

function presetSelectValue(current: string | undefined, presets: { value: string }[]): string {
  const c = current ?? "";
  if (presets.some((p) => p.value === c)) return c;
  return "__custom__";
}

export function AdminMainBottomNavPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<MainBottomNavAdminRow[] | null>(null);
  const [previewVisible, setPreviewVisible] = useState<BottomNavItemConfig[]>([]);
  const [fromDb, setFromDb] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/main-bottom-nav", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setMessage({ type: "err", text: data?.error ?? t("admin_menu_bottom_err_load") });
        setRows(null);
        return;
      }
      setRows(data.items as MainBottomNavAdminRow[]);
      setPreviewVisible(Array.isArray(data.preview_visible) ? (data.preview_visible as BottomNavItemConfig[]) : []);
      setFromDb(Boolean(data.from_db));
      setUpdatedAt(typeof data.updated_at === "string" ? data.updated_at : null);
    } catch {
      setMessage({ type: "err", text: t("admin_menu_bottom_err_network") });
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const move = (index: number, dir: -1 | 1) => {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const patchRow = (index: number, patch: Partial<MainBottomNavAdminRow>) => {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => {
      if (!prev || prev.length >= MAX_TABS) return prev;
      const id = generateCustomBottomNavTabId();
      const row: MainBottomNavAdminRow = {
        id,
        visible: true,
        label: t("admin_menu_bottom_new_label"),
        href: "/philife",
        icon: "home",
      };
      return [...prev, row];
    });
  };

  const removeRow = (index: number) => {
    setRows((prev) => {
      if (!prev || prev.length <= 1) return prev;
      return prev.filter((_, j) => j !== index);
    });
  };

  const save = async () => {
    if (!rows || rows.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/main-bottom-nav", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rows.map((r) => rowToPayloadItem(r, t("admin_menu_bottom_default_label"))) }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const err = data?.error as string | undefined;
        const hint = err ? BOTTOM_NAV_SAVE_ERROR_KEYS[err] : undefined;
        setMessage({
          type: "err",
          text: hint ? t(hint) : err ?? t("admin_menu_bottom_err_save"),
        });
        return;
      }
      setRows(data.items as MainBottomNavAdminRow[]);
      setPreviewVisible(Array.isArray(data.preview_visible) ? (data.preview_visible as BottomNavItemConfig[]) : []);
      setFromDb(true);
      notifyMainBottomNavConfigChanged();
      setMessage({ type: "ok", text: t("admin_menu_bottom_save_ok") });
    } catch {
      setMessage({ type: "err", text: t("admin_menu_bottom_err_network") });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm(t("admin_menu_bottom_reset_confirm"))) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/main-bottom-nav", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setMessage({ type: "err", text: data?.error ?? t("admin_menu_bottom_err_save") });
        return;
      }
      setRows(data.items as MainBottomNavAdminRow[]);
      setPreviewVisible(Array.isArray(data.preview_visible) ? (data.preview_visible as BottomNavItemConfig[]) : []);
      setFromDb(false);
      setUpdatedAt(null);
      notifyMainBottomNavConfigChanged();
      setMessage({ type: "ok", text: t("admin_menu_bottom_reset_ok") });
    } catch {
      setMessage({ type: "err", text: t("admin_menu_bottom_err_network") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_bottom_title" descriptionKey="admin_menu_bottom_desc" />

      <div className="flex flex-wrap items-center gap-2 sam-text-body-secondary text-sam-muted">
        <span>
          {t("admin_menu_bottom_storage")}{" "}
          <code className="rounded bg-sam-surface-muted px-1">admin_settings.main_bottom_nav</code>
        </span>
        {fromDb ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">{t("admin_menu_bottom_from_db")}</span>
        ) : (
          <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 text-sam-fg">{t("admin_menu_bottom_from_code")}</span>
        )}
        {updatedAt ? (
          <span className="text-sam-muted">{t("admin_menu_bottom_last_updated", { at: updatedAt })}</span>
        ) : null}
        {rows ? (
          <>
            <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 text-sam-fg">
              {t("admin_menu_bottom_visible_count", { count: String(rows.filter((r) => r.visible).length) })}
            </span>
            <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 text-sam-fg">
              {t("admin_menu_bottom_hidden_count", { count: String(rows.filter((r) => !r.visible).length) })}
            </span>
          </>
        ) : null}
      </div>

      {previewVisible.length > 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3">
          <p className="sam-text-helper font-medium text-sam-fg">{t("admin_menu_bottom_preview_title")}</p>
          <p className="mt-1 sam-text-xxs text-sam-muted">
            {previewVisible.map((tab) => `${tab.label}(${tab.href})`).join(" · ")}
          </p>
        </div>
      ) : null}

      {message ? (
        <div
          className={`rounded-ui-rect px-4 py-2 sam-text-body ${
            message.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || loading || !rows}
          onClick={() => void save()}
          className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90 disabled:opacity-50"
        >
          {saving ? t("admin_menu_saving") : t("common_save")}
        </button>
        <button
          type="button"
          disabled={saving || loading || !rows || rows.length >= MAX_TABS}
          onClick={addRow}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
        >
          {t("admin_menu_bottom_add_tab")}
        </button>
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void load()}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
        >
          {t("admin_menu_bottom_reload")}
        </button>
        <button
          type="button"
          disabled={saving || loading || !fromDb}
          onClick={() => void reset()}
          className="rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-2 sam-text-body text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {t("admin_menu_bottom_reset_db")}
        </button>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
        >
          {showAdvanced ? t("admin_menu_bottom_advanced_collapse") : t("admin_menu_bottom_advanced_expand")}
        </button>
      </div>

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-10 text-center sam-text-body text-sam-muted">
          {t("common_loading")}
        </div>
      ) : !rows ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body text-amber-900">
          {t("admin_menu_bottom_load_fail")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="min-w-[1100px] w-full border-collapse text-left sam-text-helper">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-sam-muted">
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_order")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_visible")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_delete")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_id")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_label")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_href")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_icon")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_font")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_font_size")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_label_active")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_label_inactive")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_icon_active")}</th>
                <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_icon_inactive")}</th>
                {showAdvanced ? (
                  <>
                    <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_size_direct")}</th>
                    <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_label_active_extra")}</th>
                    <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_label_inactive_extra")}</th>
                    <th className="px-2 py-2 font-medium">{t("admin_menu_bottom_th_icon_size")}</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className="border-b border-sam-border-soft align-top">
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="rounded border border-sam-border px-1.5 py-0.5 sam-text-xxs disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={i === rows.length - 1}
                        onClick={() => move(i, 1)}
                        className="rounded border border-sam-border px-1.5 py-0.5 sam-text-xxs disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.visible}
                        onChange={(e) => patchRow(i, { visible: e.target.checked })}
                        className="h-4 w-4"
                        title={t("admin_menu_bottom_hide_title")}
                      />
                      <button
                        type="button"
                        onClick={() => patchRow(i, { visible: !row.visible })}
                        className={`rounded border px-2 py-0.5 sam-text-xxs ${
                          row.visible
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-emerald-300 bg-emerald-50 text-emerald-900"
                        }`}
                        title={row.visible ? t("admin_menu_bottom_hide_menu_title") : t("admin_menu_bottom_show_menu_title")}
                      >
                        {row.visible ? t("admin_menu_bottom_hide_btn") : t("admin_menu_bottom_show_btn")}
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      disabled={rows.length <= 1}
                      onClick={() => removeRow(i)}
                      className="rounded border border-red-200 bg-red-50 px-2 py-0.5 sam-text-xxs text-red-800 disabled:opacity-30"
                      title={rows.length <= 1 ? t("admin_menu_bottom_delete_min_title") : t("admin_menu_bottom_delete_tab_title")}
                    >
                      {t("common_delete")}
                    </button>
                  </td>
                  <td className="max-w-[100px] truncate px-2 py-2 font-mono sam-text-xxs text-sam-fg" title={row.id}>
                    {row.id}
                    {isBuiltinBottomNavTabId(row.id) ? (
                      <span className="ml-1 sam-text-xxs text-sam-meta">{t("admin_menu_bottom_builtin")}</span>
                    ) : (
                      <span className="ml-1 sam-text-xxs text-signature">{t("admin_menu_bottom_custom")}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.label}
                      onChange={(e) => patchRow(i, { label: e.target.value })}
                      className="w-[88px] max-w-full rounded border border-sam-border px-1.5 py-1 sam-text-helper"
                      maxLength={24}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.href}
                      onChange={(e) => patchRow(i, { href: e.target.value })}
                      className="w-[100px] max-w-full rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                      maxLength={160}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={row.icon}
                      onChange={(e) => patchRow(i, { icon: e.target.value as BottomNavIconKey })}
                      className="max-w-[120px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {ICON_OPTION_KEYS.map((iconKey) => (
                        <option key={iconKey} value={iconKey}>
                          {t(BOTTOM_NAV_ICON_LABEL_KEYS[iconKey])}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={row.labelFontFamilyClass ?? ""}
                      onChange={(e) => patchRow(i, { labelFontFamilyClass: e.target.value || undefined })}
                      className="max-w-[100px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_FONT_FAMILY_PRESETS.map((o) => (
                        <option key={o.value || "__default__"} value={o.value}>
                          {t(bottomNavPresetLabelKey(o.value, BOTTOM_NAV_FONT_PRESET_KEYS))}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={presetSelectValue(row.labelSizeClass, MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return;
                        patchRow(i, { labelSizeClass: v || undefined });
                      }}
                      className="max-w-[100px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS.map((o) => (
                        <option key={o.value || "__default__"} value={o.value}>
                          {t(bottomNavPresetLabelKey(o.value, BOTTOM_NAV_LABEL_SIZE_PRESET_KEYS))}
                        </option>
                      ))}
                      {row.labelSizeClass && !MAIN_BOTTOM_NAV_LABEL_SIZE_PRESETS.some((p) => p.value === row.labelSizeClass) ? (
                        <option value="__custom__">{t("admin_menu_bottom_preset_custom")}</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={presetSelectValue(row.labelActiveClass, MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return;
                        patchRow(i, { labelActiveClass: v || undefined });
                      }}
                      className="max-w-[120px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS.map((o) => (
                        <option key={o.value || "__default__"} value={o.value}>
                          {t(bottomNavPresetLabelKey(o.value, BOTTOM_NAV_LABEL_ACTIVE_PRESET_KEYS))}
                        </option>
                      ))}
                      {row.labelActiveClass &&
                      !MAIN_BOTTOM_NAV_LABEL_ACTIVE_STYLE_PRESETS.some((p) => p.value === (row.labelActiveClass ?? "")) ? (
                        <option value="__custom__">{t("admin_menu_bottom_preset_custom")}</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={presetSelectValue(row.labelInactiveClass, MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return;
                        patchRow(i, { labelInactiveClass: v || undefined });
                      }}
                      className="max-w-[120px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS.map((o) => (
                        <option key={o.value || "__default__"} value={o.value}>
                          {t(bottomNavPresetLabelKey(o.value, BOTTOM_NAV_LABEL_INACTIVE_PRESET_KEYS))}
                        </option>
                      ))}
                      {row.labelInactiveClass &&
                      !MAIN_BOTTOM_NAV_LABEL_INACTIVE_STYLE_PRESETS.some((p) => p.value === (row.labelInactiveClass ?? "")) ? (
                        <option value="__custom__">{t("admin_menu_bottom_preset_custom")}</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={presetSelectValue(row.iconActiveClass, MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return;
                        patchRow(i, { iconActiveClass: v || undefined });
                      }}
                      className="max-w-[100px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS.map((o) => (
                        <option key={o.value || "__default__"} value={o.value}>
                          {t(bottomNavPresetLabelKey(o.value, BOTTOM_NAV_ICON_ACTIVE_PRESET_KEYS))}
                        </option>
                      ))}
                      {row.iconActiveClass &&
                      !MAIN_BOTTOM_NAV_ICON_ACTIVE_STYLE_PRESETS.some((p) => p.value === (row.iconActiveClass ?? "")) ? (
                        <option value="__custom__">{t("admin_menu_bottom_preset_custom_short")}</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={presetSelectValue(row.iconInactiveClass, MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return;
                        patchRow(i, { iconInactiveClass: v || undefined });
                      }}
                      className="max-w-[100px] rounded border border-sam-border px-1 py-1 sam-text-xxs"
                    >
                      {MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS.map((o) => (
                        <option key={o.value || "__default__"} value={o.value}>
                          {t(bottomNavPresetLabelKey(o.value, BOTTOM_NAV_ICON_INACTIVE_PRESET_KEYS))}
                        </option>
                      ))}
                      {row.iconInactiveClass &&
                      !MAIN_BOTTOM_NAV_ICON_INACTIVE_STYLE_PRESETS.some((p) => p.value === (row.iconInactiveClass ?? "")) ? (
                        <option value="__custom__">{t("admin_menu_bottom_preset_custom_short")}</option>
                      ) : null}
                    </select>
                  </td>
                  {showAdvanced ? (
                    <>
                      <td className="px-2 py-2">
                        <input
                          value={row.labelSizeClass ?? ""}
                          onChange={(e) => patchRow(i, { labelSizeClass: e.target.value || undefined })}
                          placeholder={t("admin_menu_bottom_ph_label_size")}
                          className="w-[100px] rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                          maxLength={120}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.labelActiveExtraClass ?? ""}
                          onChange={(e) => patchRow(i, { labelActiveExtraClass: e.target.value || undefined })}
                          placeholder={t("admin_menu_bottom_ph_extra_class")}
                          className="w-[100px] rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                          maxLength={120}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.labelInactiveExtraClass ?? ""}
                          onChange={(e) => patchRow(i, { labelInactiveExtraClass: e.target.value || undefined })}
                          className="w-[100px] rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                          maxLength={120}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={row.iconSizeClass ?? ""}
                          onChange={(e) => patchRow(i, { iconSizeClass: e.target.value || undefined })}
                          placeholder={t("admin_menu_bottom_ph_icon_size")}
                          className="w-[90px] rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                          maxLength={120}
                        />
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="sam-text-helper leading-relaxed text-sam-muted">{t("admin_menu_bottom_footer")}</p>
    </div>
  );
}

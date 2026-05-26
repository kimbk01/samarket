"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  MainBottomNavIconPickerModal,
  MainBottomNavIconPickerTrigger,
} from "@/components/admin/menus/MainBottomNavIconPickerModal";
import type { MainBottomNavAdminRow } from "@/lib/main-menu/main-bottom-nav-types";
import {
  applyMainBottomNavFabIconPatch,
} from "@/lib/main-menu/main-bottom-nav-admin-edit";
import {
  MAIN_BOTTOM_NAV_FAB_MAX_ITEMS,
  type MainBottomNavFabStoredConfig,
  type MainBottomNavFabStoredItem,
} from "@/lib/main-menu/main-bottom-nav-fab-types";
import {
  createDefaultMainBottomNavFabItem,
  getDefaultDeliveryFabConfig,
} from "@/lib/main-menu/resolve-main-bottom-nav-fab";

interface MainBottomNavFabEditorProps {
  row: MainBottomNavAdminRow;
  disabled?: boolean;
  onChange: (fab: MainBottomNavFabStoredConfig | undefined) => void;
  onClose: () => void;
}

export function MainBottomNavFabEditor({
  row,
  disabled = false,
  onChange,
  onClose,
}: MainBottomNavFabEditorProps) {
  const { t } = useI18n();
  const menuLabel = row.label.trim() || row.id;
  const [enabled, setEnabled] = useState(Boolean(row.fab?.enabled));
  const [items, setItems] = useState<MainBottomNavFabStoredItem[]>(
    row.fab?.items?.map((item) => ({ ...item })) ?? []
  );
  const [iconPickerItemId, setIconPickerItemId] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(Boolean(row.fab?.enabled));
    setItems(row.fab?.items?.map((item) => ({ ...item })) ?? []);
    setIconPickerItemId(null);
  }, [row]);

  const iconPickerItem = useMemo(
    () => (iconPickerItemId ? items.find((item) => item.id === iconPickerItemId) ?? null : null),
    [iconPickerItemId, items]
  );

  const emitChange = (nextEnabled: boolean, nextItems: MainBottomNavFabStoredItem[]) => {
    if (!nextEnabled || nextItems.length === 0) {
      onChange(undefined);
      return;
    }
    onChange({ enabled: true, items: nextItems });
  };

  const patchItem = (index: number, patch: Partial<MainBottomNavFabStoredItem>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      emitChange(enabled, next);
      return next;
    });
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      emitChange(enabled, next);
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      emitChange(enabled, next);
      return next;
    });
  };

  const addItem = () => {
    if (items.length >= MAIN_BOTTOM_NAV_FAB_MAX_ITEMS) return;
    const next = [...items, createDefaultMainBottomNavFabItem(t("admin_menu_bottom_new_label"))];
    setItems(next);
    emitChange(enabled, next);
  };

  const applyDeliveryDefaults = () => {
    const defaults = getDefaultDeliveryFabConfig();
    setEnabled(true);
    setItems(defaults.items.map((item) => ({ ...item })));
    onChange(defaults);
  };

  const toggleEnabled = (checked: boolean) => {
    setEnabled(checked);
    if (checked && items.length === 0) {
      const defaults = getDefaultDeliveryFabConfig();
      setItems(defaults.items.map((item) => ({ ...item })));
      onChange(defaults);
      return;
    }
    emitChange(checked, items);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-3"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="relative z-[101] flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-ui-rect bg-sam-surface shadow-sam-elevated"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="main-bottom-nav-fab-editor-title"
      >
        <div className="border-b border-sam-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="main-bottom-nav-fab-editor-title" className="sam-text-body font-semibold text-sam-fg">
                {t("admin_menu_bottom_fab_title")}
              </h2>
              <p className="mt-0.5 sam-text-helper text-sam-muted">
                {t("admin_menu_bottom_fab_desc", { name: menuLabel })}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-ui-rect border border-sam-border px-2 py-0.5 sam-text-helper text-sam-muted hover:bg-sam-app"
              aria-label={t("admin_menu_close_aria")}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-sam-border px-4 py-2">
          <label className="flex items-center gap-2 sam-text-body text-sam-fg">
            <input
              type="checkbox"
              checked={enabled}
              disabled={disabled}
              onChange={(e) => toggleEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            {t("admin_menu_bottom_fab_enabled")}
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={applyDeliveryDefaults}
            className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-1 sam-text-helper text-sam-fg hover:bg-sam-surface"
          >
            {t("admin_menu_bottom_fab_apply_defaults")}
          </button>
          <button
            type="button"
            disabled={disabled || !enabled || items.length >= MAIN_BOTTOM_NAV_FAB_MAX_ITEMS}
            onClick={addItem}
            className="rounded-ui-rect border border-signature bg-signature/5 px-3 py-1 sam-text-helper text-signature hover:bg-signature/10 disabled:opacity-40"
          >
            {t("admin_menu_bottom_fab_add_item")}
          </button>
          <span className="sam-text-helper text-sam-muted">
            {t("admin_menu_bottom_fab_max_items", { max: MAIN_BOTTOM_NAV_FAB_MAX_ITEMS })}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {!enabled ? (
            <p className="sam-text-body text-sam-muted">{t("admin_menu_bottom_fab_empty")}</p>
          ) : items.length === 0 ? (
            <p className="sam-text-body text-sam-muted">{t("admin_menu_bottom_fab_empty")}</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse sam-text-helper">
              <thead>
                <tr className="border-b border-sam-border bg-sam-app">
                  <th className="px-2 py-1.5 text-left font-medium">{t("admin_menu_bottom_th_order")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("admin_menu_bottom_th_visible")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("admin_menu_bottom_th_icon")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("admin_menu_bottom_th_label")}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("admin_menu_bottom_th_href")}</th>
                  <th className="px-2 py-1.5 text-center font-medium">{t("admin_menu_bottom_th_open_new")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("admin_menu_th_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className="border-b border-sam-border-soft align-middle">
                    <td className="px-2 py-1">
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          disabled={disabled || i === 0}
                          onClick={() => moveItem(i, -1)}
                          className="rounded border border-sam-border px-1 py-0.5 sam-text-xxs disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={disabled || i === items.length - 1}
                          onClick={() => moveItem(i, 1)}
                          className="rounded border border-sam-border px-1 py-0.5 sam-text-xxs disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={item.visible}
                        disabled={disabled}
                        onChange={(e) => patchItem(i, { visible: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <MainBottomNavIconPickerTrigger
                        value={{ icon: item.icon, lucideIcon: item.lucideIcon }}
                        label={item.label}
                        disabled={disabled}
                        onOpen={() => setIconPickerItemId(item.id)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={item.label}
                        disabled={disabled}
                        onChange={(e) => patchItem(i, { label: e.target.value })}
                        className="w-full min-w-[72px] max-w-[120px] rounded border border-sam-border px-1.5 py-1 sam-text-helper"
                        maxLength={24}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={item.href}
                        disabled={disabled}
                        onChange={(e) => patchItem(i, { href: e.target.value })}
                        className="w-full min-w-[140px] rounded border border-sam-border px-1.5 py-1 font-mono sam-text-xxs"
                        maxLength={160}
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={item.openInNewTab === true}
                        disabled={disabled}
                        onChange={(e) => patchItem(i, { openInNewTab: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => removeItem(i)}
                        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 sam-text-xxs text-red-800 hover:bg-red-100"
                      >
                        {t("common_delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-sam-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90"
          >
            {t("admin_menu_bottom_icon_apply")}
          </button>
        </div>
      </div>

      {iconPickerItem ? (
        <MainBottomNavIconPickerModal
          menuLabel={iconPickerItem.label}
          value={{ icon: iconPickerItem.icon, lucideIcon: iconPickerItem.lucideIcon }}
          disabled={disabled}
          onApply={(patch) => {
            setItems((prev) => {
              const index = prev.findIndex((item) => item.id === iconPickerItem.id);
              if (index < 0) return prev;
              const next = [...prev];
              next[index] = applyMainBottomNavFabIconPatch(next[index], patch);
              emitChange(enabled, next);
              return next;
            });
          }}
          onClose={() => setIconPickerItemId(null)}
        />
      ) : null}
    </div>
  );
}

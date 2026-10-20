"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  MainBottomNavIconPickerModal,
  MainBottomNavIconPickerTrigger,
} from "@/components/admin/menus/MainBottomNavIconPickerModal";
import type { MainBottomNavAdminRow } from "@/lib/main-menu/main-bottom-nav-types";
import {
  applyMainBottomNavFabIconPatch,
  patchMainBottomNavRowFab,
} from "@/lib/main-menu/main-bottom-nav-admin-edit";
import {
  MAIN_BOTTOM_NAV_FAB_MAX_ITEMS,
  type MainBottomNavFabStoredConfig,
  type MainBottomNavFabStoredItem,
} from "@/lib/main-menu/main-bottom-nav-fab-types";
import { createDefaultMainBottomNavFabItem } from "@/lib/main-menu/resolve-main-bottom-nav-fab";
import { buildLocalizedDefaultDeliveryFabConfig } from "@/lib/main-menu/main-bottom-nav-fab-i18n";
import {
  createMainBottomNavFabStoreAdminItem,
  isMainBottomNavFabStoreAdminItem,
} from "@/lib/main-menu/main-bottom-nav-fab-store-admin";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

interface MainBottomNavFabInlineSectionProps {
  row: MainBottomNavAdminRow;
  disabled?: boolean;
  onChange: (fab: MainBottomNavFabStoredConfig | undefined) => void;
}

export function MainBottomNavFabInlineSection({
  row,
  disabled = false,
  onChange,
}: MainBottomNavFabInlineSectionProps) {
  const { t } = useI18n();
  const [iconPickerItemId, setIconPickerItemId] = useState<string | null>(null);
  const enabled = Boolean(row.fab?.enabled);
  const items = row.fab?.items ?? [];

  const iconPickerItem = useMemo(
    () => (iconPickerItemId ? items.find((item) => item.id === iconPickerItemId) ?? null : null),
    [iconPickerItemId, items]
  );

  const emitFab = (nextEnabled: boolean, nextItems: MainBottomNavFabStoredItem[]) => {
    if (!nextEnabled || nextItems.length === 0) {
      onChange(undefined);
      return;
    }
    onChange({ enabled: true, items: nextItems });
  };

  const setItems = (nextItems: MainBottomNavFabStoredItem[], nextEnabled = enabled || nextItems.length > 0) => {
    onChange(
      nextEnabled && nextItems.length > 0 ? { enabled: true, items: nextItems } : undefined
    );
  };

  const addItem = () => {
    if (items.length >= MAIN_BOTTOM_NAV_FAB_MAX_ITEMS) return;
    const next = [...items, createDefaultMainBottomNavFabItem(t("admin_menu_bottom_new_label"))];
    setItems(next, true);
  };

  const applyDeliveryDefaults = () => {
    onChange(buildLocalizedDefaultDeliveryFabConfig(t));
  };

  const addStoreAdminItem = () => {
    if (items.some((item) => isMainBottomNavFabStoreAdminItem(item))) return;
    const next = [createMainBottomNavFabStoreAdminItem(t("store_delivery_fab_store")), ...items];
    setItems(next, true);
  };

  const patchItem = (index: number, patch: Partial<MainBottomNavFabStoredItem>) => {
    const next = [...items];
    next[index] = { ...next[index], ...patch };
    setItems(next);
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    const next = [...items];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
  };

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    emitFab(enabled, next);
  };

  const disableFab = () => {
    onChange(undefined);
  };

  return (
    <div className="rounded-ui-rect border border-sam-primary-border/80 bg-sam-primary-soft px-3 py-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="sam-text-helper font-semibold text-sam-primary">
            {t("admin_menu_bottom_fab_title")}
          </span>
          {enabled ? (
            <span className="rounded-full bg-sam-primary-soft px-2 py-0.5 sam-text-xxs text-sam-primary">
              {t("admin_menu_bottom_fab_enabled_count", { count: items.length })}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {row.id === "stores" ? (
            <>
              <AdminActionButton
                variant="secondary"
                size="sm"
                type="button"
                disabled={disabled}
                onClick={applyDeliveryDefaults}
              >
                {t("admin_menu_bottom_fab_apply_defaults")}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                size="sm"
                type="button"
                disabled={
                  disabled || items.some((item) => isMainBottomNavFabStoreAdminItem(item))
                }
                onClick={addStoreAdminItem}
              >
                {t("admin_menu_bottom_fab_add_store_admin")}
              </AdminActionButton>
            </>
          ) : null}
          <AdminActionButton
            variant="secondary"
            size="sm"
            type="button"
            disabled={disabled || items.length >= MAIN_BOTTOM_NAV_FAB_MAX_ITEMS}
            onClick={addItem}
          >
            + {t("admin_menu_bottom_fab_add_item")}
          </AdminActionButton>
          {enabled ? (
            <AdminActionButton
              variant="quiet"
              size="sm"
              type="button"
              disabled={disabled}
              onClick={disableFab}
            >
              {t("admin_menu_bottom_fab_disable")}
            </AdminActionButton>
          ) : null}
        </div>
      </div>

      {row.id === "stores" ? (
        <p className="mb-2 sam-text-xxs leading-relaxed text-sam-primary/80">
          {t("admin_menu_bottom_fab_store_admin_hint")}
        </p>
      ) : null}
      {!enabled || items.length === 0 ? (
        <p className="sam-text-helper text-sam-muted">{t("admin_menu_bottom_fab_empty_inline")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse sam-text-xxs">
            <thead>
              <tr className="border-b border-sam-primary-border/60 text-left text-sam-primary/80">
                <th className="px-1 py-1 font-medium">{t("admin_menu_bottom_th_order")}</th>
                <th className="px-1 py-1 font-medium">{t("admin_menu_bottom_th_visible")}</th>
                <th className="px-1 py-1 font-medium">{t("admin_menu_bottom_th_icon")}</th>
                <th className="px-1 py-1 font-medium">{t("admin_menu_bottom_th_label")}</th>
                <th className="px-1 py-1 font-medium">{t("admin_menu_bottom_th_href")}</th>
                <th className="px-1 py-1 text-center font-medium">{t("admin_menu_bottom_th_open_new")}</th>
                <th className="px-1 py-1 text-right font-medium">{t("admin_menu_th_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className="border-b border-sam-primary-border/80 align-middle">
                  <td className="px-1 py-0.5">
                    <div className="flex gap-0.5">
                      <AdminActionButton
                        variant="quiet"
                        size="sm"
                        type="button"
                        disabled={disabled || i === 0}
                        onClick={() => moveItem(i, -1)}
                        aria-label={t("admin_menu_bottom_move_up")}
                      >
                        ↑
                      </AdminActionButton>
                      <AdminActionButton
                        variant="quiet"
                        size="sm"
                        type="button"
                        disabled={disabled || i === items.length - 1}
                        onClick={() => moveItem(i, 1)}
                        aria-label={t("admin_menu_bottom_move_down")}
                      >
                        ↓
                      </AdminActionButton>
                    </div>
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={item.visible}
                      disabled={disabled}
                      onChange={(e) => patchItem(i, { visible: e.target.checked })}
                      className="h-3.5 w-3.5"
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <MainBottomNavIconPickerTrigger
                      value={{ icon: item.icon, lucideIcon: item.lucideIcon }}
                      label={item.label}
                      disabled={disabled}
                      onOpen={() => setIconPickerItemId(item.id)}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      value={item.label}
                      disabled={disabled}
                      onChange={(e) => patchItem(i, { label: e.target.value })}
                      className="w-full min-w-[64px] max-w-[100px] rounded border border-sam-border px-1 py-0.5"
                      maxLength={24}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      value={item.href}
                      disabled={disabled}
                      onChange={(e) => patchItem(i, { href: e.target.value })}
                      className="w-full min-w-[120px] rounded border border-sam-border px-1 py-0.5 font-mono"
                      maxLength={160}
                    />
                  </td>
                  <td className="px-1 py-0.5 text-center">
                    <input
                      type="checkbox"
                      checked={item.openInNewTab === true}
                      disabled={disabled}
                      onChange={(e) => patchItem(i, { openInNewTab: e.target.checked })}
                      className="h-3.5 w-3.5"
                    />
                  </td>
                  <td className="px-1 py-0.5 text-right">
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      disabled={disabled}
                      onClick={() => removeItem(i)}
                    >
                      {t("common_delete")}
                    </AdminActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {iconPickerItem ? (
        <MainBottomNavIconPickerModal
          menuLabel={iconPickerItem.label}
          value={{ icon: iconPickerItem.icon, lucideIcon: iconPickerItem.lucideIcon }}
          disabled={disabled}
          onApply={(patch) => {
            const index = items.findIndex((item) => item.id === iconPickerItem.id);
            if (index < 0) return;
            const next = [...items];
            next[index] = applyMainBottomNavFabIconPatch(next[index], patch);
            setItems(next);
            setIconPickerItemId(null);
          }}
          onClose={() => setIconPickerItemId(null)}
        />
      ) : null}
    </div>
  );
}

/** row patch helper for parent */
export function applyFabInlineChange(
  row: MainBottomNavAdminRow,
  fab: MainBottomNavFabStoredConfig | undefined
): MainBottomNavAdminRow {
  return patchMainBottomNavRowFab(row, fab);
}

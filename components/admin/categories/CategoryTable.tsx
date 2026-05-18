"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CategoryTypeBadge } from "./CategoryTypeBadge";
import { CategoryStatusBadge } from "./CategoryStatusBadge";

interface CategoryTableProps {
  items: CategoryWithSettings[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onToggleActive: (id: string) => void;
}

export function CategoryTable({
  items,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleActive,
}: CategoryTableProps) {
  const { t } = useI18n();
  if (items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_cat_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[800px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2 text-left font-medium text-sam-fg">{t("admin_cat_th_order")}</th>
            <th className="px-3 py-2 text-left font-medium text-sam-fg">{t("admin_cat_th_name")}</th>
            <th className="px-3 py-2 text-left font-medium text-sam-fg">slug</th>
            <th className="px-3 py-2 text-left font-medium text-sam-fg">{t("admin_cat_th_icon")}</th>
            <th className="px-3 py-2 text-left font-medium text-sam-fg">{t("admin_cat_th_type")}</th>
            <th className="px-3 py-2 text-left font-medium text-sam-fg">{t("admin_cat_th_active")}</th>
            <th className="px-3 py-2 text-center font-medium text-sam-fg">{t("admin_cat_th_write")}</th>
            <th className="px-3 py-2 text-center font-medium text-sam-fg">{t("admin_cat_th_price")}</th>
            <th className="px-3 py-2 text-center font-medium text-sam-fg">{t("admin_cat_th_chat")}</th>
            <th className="px-3 py-2 text-center font-medium text-sam-fg">{t("admin_cat_th_location")}</th>
            <th className="px-3 py-2 text-left font-medium text-sam-fg">post_type</th>
            <th className="px-3 py-2 text-center font-medium text-sam-fg">{t("admin_cat_th_launcher")}</th>
            <th className="px-3 py-2 text-center font-medium text-sam-fg">{t("admin_cat_th_launcher_group")}</th>
            <th className="px-3 py-2 text-center font-medium text-sam-fg">{t("admin_cat_th_launcher_order")}</th>
            <th className="px-3 py-2 text-center font-medium text-sam-fg">{t("admin_cat_th_chip")}</th>
            <th className="px-3 py-2 text-right font-medium text-sam-fg">{t("admin_cat_th_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c, index) => (
            <tr key={c.id} className="border-b border-sam-border-soft hover:bg-sam-app/50">
              <td className="px-3 py-2 text-sam-muted">{c.sort_order + 1}</td>
              <td className="px-3 py-2 font-medium text-sam-fg">{c.name}</td>
              <td className="px-3 py-2 sam-text-helper text-sam-muted">{c.slug}</td>
              <td className="px-3 py-2 text-sam-muted">{c.icon_key}</td>
              <td className="px-3 py-2">
                <CategoryTypeBadge type={c.type} />
              </td>
              <td className="px-3 py-2">
                <CategoryStatusBadge isActive={c.is_active} />
              </td>
              <td className="px-3 py-2 text-center">{c.settings?.can_write ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-center">{c.settings?.has_price ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-center">{c.settings?.has_chat ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-center">{c.settings?.has_location ? "✓" : "—"}</td>
              <td className="px-3 py-2 sam-text-helper text-sam-muted">{c.settings?.post_type ?? "—"}</td>
              <td className="px-3 py-2 text-center">{c.quick_create_enabled ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-center sam-text-helper text-sam-muted">{c.quick_create_group ?? "—"}</td>
              <td className="px-3 py-2 text-center sam-text-helper text-sam-muted">{c.quick_create_order}</td>
              <td className="px-3 py-2 text-center">{c.show_in_home_chips !== false ? "✓" : "—"}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onMoveUp(c.id)}
                    disabled={index === 0}
                    className="rounded p-1 text-sam-muted hover:bg-sam-border-soft disabled:opacity-40"
                    title={t("admin_cat_move_up")}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveDown(c.id)}
                    disabled={index === items.length - 1}
                    className="rounded p-1 text-sam-muted hover:bg-sam-border-soft disabled:opacity-40"
                    title={t("admin_cat_move_down")}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleActive(c.id)}
                    className="rounded px-1.5 py-0.5 sam-text-helper text-sam-muted hover:bg-sam-border-soft"
                  >
                    {c.is_active ? "OFF" : "ON"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(c.id)}
                    className="rounded px-1.5 py-0.5 sam-text-helper text-signature hover:bg-signature/10"
                  >
                    {t("admin_cat_edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    className="rounded px-1.5 py-0.5 sam-text-helper text-red-600 hover:bg-red-50"
                  >
                    {t("admin_cat_delete")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

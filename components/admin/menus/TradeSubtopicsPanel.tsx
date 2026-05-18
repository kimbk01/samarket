"use client";

import { useCallback, useMemo, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { swapCategorySortOrders } from "@/lib/categories/swapCategorySortOrder";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CategorySubtopicFormModal } from "./CategorySubtopicFormModal";

interface TradeSubtopicsPanelProps {
  parent: CategoryWithSettings;
  allCategories: CategoryWithSettings[];
  onRefresh: () => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onClose?: () => void;
}

/** 홈·마켓 2행 주제 CRUD — 메뉴 모달·전용 어드민 페이지에서 공유 */
export function TradeSubtopicsPanel({
  parent,
  allCategories,
  onRefresh,
  onDelete,
  onClose,
}: TradeSubtopicsPanelProps) {
  const { t } = useI18n();
  const siblings = useMemo(
    () =>
      allCategories
        .filter((c) => c.parent_id === parent.id)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [allCategories, parent.id]
  );

  const nextSortOrder = siblings.length;

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? siblings.find((c) => c.id === editingId) ?? null : null;

  const refresh = useCallback(async () => {
    await onRefresh();
  }, [onRefresh]);

  const handleMoveUp = useCallback(
    async (id: string) => {
      const idx = siblings.findIndex((c) => c.id === id);
      if (idx <= 0) return;
      const res = await swapCategorySortOrders(siblings[idx], siblings[idx - 1]);
      if (res.ok) await refresh();
    },
    [siblings, refresh]
  );

  const handleMoveDown = useCallback(
    async (id: string) => {
      const idx = siblings.findIndex((c) => c.id === id);
      if (idx === -1 || idx >= siblings.length - 1) return;
      const res = await swapCategorySortOrders(siblings[idx], siblings[idx + 1]);
      if (res.ok) await refresh();
    },
    [siblings, refresh]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="sam-text-section-title font-semibold text-sam-fg">
            {onClose ? t("admin_menu_subtopic_modal_title") : t("admin_menu_subtopic_parent_title", { name: parent.name })}
          </h2>
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_menu_subtopic_desc")}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect px-2 py-1 sam-text-body text-sam-muted hover:bg-sam-surface-muted"
            aria-label={t("admin_menu_close_aria")}
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-body-secondary font-medium text-white hover:bg-signature/90"
        >
          {t("admin_menu_subtopic_add")}
        </button>
      </div>

      {siblings.length === 0 ? (
        <div className="space-y-3">
          <p className="rounded-ui-rect border border-dashed border-sam-border py-6 text-center sam-text-body text-sam-muted">
            {t("admin_menu_subtopic_empty")}
          </p>
          <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-900">
            <strong className="font-medium">{t("admin_menu_subtopic_migration_title")}</strong>{" "}
            {t("admin_menu_subtopic_migration_body")}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[480px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2 text-left font-medium text-sam-fg">{t("admin_menu_th_order")}</th>
                <th className="px-3 py-2 text-left font-medium text-sam-fg">{t("admin_menu_th_name")}</th>
                <th className="px-3 py-2 text-left font-medium text-sam-fg">{t("admin_menu_th_slug")}</th>
                <th className="px-3 py-2 text-left font-medium text-sam-fg">{t("admin_menu_th_status")}</th>
                <th className="px-3 py-2 text-right font-medium text-sam-fg">{t("admin_menu_th_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {siblings.map((c, index) => (
                <tr key={c.id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2 text-sam-muted">{c.sort_order}</td>
                  <td className="px-3 py-2 font-medium text-sam-fg">{c.name}</td>
                  <td className="px-3 py-2 sam-text-helper text-sam-muted">{c.slug}</td>
                  <td className="px-3 py-2 sam-text-body-secondary text-sam-muted">
                    {c.is_active ? t("admin_menu_status_active") : t("admin_menu_status_inactive")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(c.id)}
                        disabled={index === 0}
                        className="rounded p-1 text-sam-muted hover:bg-sam-border-soft disabled:opacity-40"
                        title={t("admin_cat_move_up")}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(c.id)}
                        disabled={index === siblings.length - 1}
                        className="rounded p-1 text-sam-muted hover:bg-sam-border-soft disabled:opacity-40"
                        title={t("admin_cat_move_down")}
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(c.id)}
                        className="rounded px-1.5 py-0.5 sam-text-helper text-signature hover:bg-signature/10"
                      >
                        {t("admin_cat_edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        className="rounded px-1.5 py-0.5 sam-text-helper text-red-600 hover:bg-red-50"
                      >
                        {t("common_delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <CategorySubtopicFormModal
          parent={parent}
          nextSortOrder={nextSortOrder}
          onDone={() => void refresh()}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {editing && (
        <CategorySubtopicFormModal
          parent={parent}
          category={editing}
          nextSortOrder={nextSortOrder}
          onDone={() => {
            setEditingId(null);
            void refresh();
          }}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

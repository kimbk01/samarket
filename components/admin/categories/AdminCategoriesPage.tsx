"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCategoryAdmin } from "./useCategoryAdmin";
import { CategoryTable } from "./CategoryTable";
import { CategoryFormModal } from "./CategoryFormModal";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { CategoryFormPayload, CategoryFormSettingsPayload } from "./CategoryFormModal";

export function AdminCategoriesPage() {
  const { t } = useI18n();
  const {
    list,
    loading,
    message,
    supabaseAvailable,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleMoveUp,
    handleMoveDown,
    handleToggleActive,
  } = useCategoryAdmin();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const editing = editingId ? list.find((c) => c.id === editingId) ?? null : null;

  const handleSaveEdit = useCallback(
    async (payload: CategoryFormPayload, settings: CategoryFormSettingsPayload) => {
      if (!editingId) return;
      await handleUpdate(editingId, payload, settings);
      setEditingId(null);
    },
    [editingId, handleUpdate]
  );

  const handleSaveCreate = useCallback(
    async (payload: CategoryFormPayload, settings: CategoryFormSettingsPayload) => {
      await handleCreate(payload, settings);
      setCreateOpen(false);
    },
    [handleCreate]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">{t("admin_cat_page_title")}</h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={Sam.btn.primary}
        >
          {t("admin_cat_add_btn")}
        </button>
      </div>

      {supabaseAvailable === false && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-800">
          <p className="font-medium">{t("admin_cat_supabase_title")}</p>
          <p className="mt-1 text-amber-700">{t("admin_cat_supabase_body")}</p>
        </div>
      )}

      {message && (
        <div
          className={`rounded-ui-rect px-4 py-2 sam-text-body ${
            message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
          {t("admin_cat_loading")}
        </div>
      ) : (
        <CategoryTable
          items={list}
          onEdit={setEditingId}
          onDelete={(id) => void handleDelete(id)}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onToggleActive={handleToggleActive}
        />
      )}

      {editing && (
        <CategoryFormModal
          category={editing}
          onSave={handleSaveEdit}
          onDelete={() => {
            handleDelete(editing.id);
            setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      )}

      {createOpen && (
        <CategoryFormModal
          nextSortOrder={list.length}
          onSave={handleSaveCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getAdminCategories } from "@/lib/categories/admin/getAdminCategories";
import { createCategory } from "@/lib/categories/admin/createCategory";
import { updateCategoryAdmin } from "@/lib/categories/admin/updateCategory";
import { deleteCategory } from "@/lib/categories/admin/deleteCategory";
import { reorderCategories } from "@/lib/categories/admin/reorderCategories";
import { updateCategory as updateCategoryRow } from "@/lib/categories/updateCategory";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CategoryFormPayload, CategoryFormSettingsPayload } from "./CategoryFormModal";

export type CategoryAdminMessage = { type: "success" | "error"; text: string } | null;

export function useCategoryAdmin() {
  const { t } = useI18n();
  const [list, setList] = useState<CategoryWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<CategoryAdminMessage>(null);
  const [supabaseAvailable, setSupabaseAvailable] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getAdminCategories();
    setList(data);
    setSupabaseAvailable(getSupabaseClient() !== null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showSuccess = useCallback((text: string) => {
    setMessage({ type: "success", text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const showError = useCallback((text: string) => {
    setMessage({ type: "error", text });
  }, []);

  const handleCreate = useCallback(
    async (payload: CategoryFormPayload, settings: CategoryFormSettingsPayload): Promise<boolean> => {
      const res = await createCategory(
        {
          name: payload.name,
          slug: payload.slug,
          icon_key: payload.icon_key,
          type: payload.type,
          sort_order: payload.sort_order,
          is_active: payload.is_active,
          description: payload.description,
          quick_create_enabled: payload.quick_create_enabled,
          quick_create_group: payload.quick_create_group,
          quick_create_order: payload.quick_create_order,
          show_in_home_chips: payload.show_in_home_chips,
        },
        settings
      );
      if (!res.ok) {
        showError(res.error);
        return false;
      }
      showSuccess(t("admin_cat_msg_created"));
      load();
      return true;
    },
    [load, showError, showSuccess, t]
  );

  const handleUpdate = useCallback(
    async (id: string, payload: CategoryFormPayload, settings: CategoryFormSettingsPayload): Promise<boolean> => {
      const res = await updateCategoryAdmin(
        id,
        {
          name: payload.name,
          slug: payload.slug,
          icon_key: payload.icon_key,
          type: payload.type,
          sort_order: payload.sort_order,
          is_active: payload.is_active,
          description: payload.description,
          quick_create_enabled: payload.quick_create_enabled,
          quick_create_group: payload.quick_create_group,
          quick_create_order: payload.quick_create_order,
          show_in_home_chips: payload.show_in_home_chips,
        },
        settings
      );
      if (!res.ok) {
        showError(res.error);
        return false;
      }
      showSuccess("저장되었습니다.");
      load();
      return true;
    },
    [load, showError, showSuccess, t]
  );

  const handleDelete = useCallback(
    async (id: string): Promise<boolean> => {
      if (!confirm(t("admin_cat_confirm_delete"))) return false;
      const res = await deleteCategory(id);
      if (!res.ok) {
        showError(res.error);
        return false;
      }
      showSuccess(t("admin_cat_msg_deleted"));
      load();
      return true;
    },
    [load, showError, showSuccess, t]
  );

  const handleMoveUp = useCallback(
    async (id: string) => {
      const idx = list.findIndex((c) => c.id === id);
      if (idx <= 0) return;
      const next = list.slice();
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      const res = await reorderCategories(next.map((c) => c.id));
      if (!res.ok) {
        showError(res.error);
        return;
      }
      showSuccess("순서가 변경되었습니다.");
      load();
    },
    [list, load, showError, showSuccess]
  );

  const handleMoveDown = useCallback(
    async (id: string) => {
      const idx = list.findIndex((c) => c.id === id);
      if (idx === -1 || idx >= list.length - 1) return;
      const next = list.slice();
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      const res = await reorderCategories(next.map((c) => c.id));
      if (!res.ok) {
        showError(res.error);
        return;
      }
      showSuccess(t("admin_cat_msg_reordered"));
      load();
    },
    [list, load, showError, showSuccess, t]
  );

  const handleToggleActive = useCallback(
    async (id: string) => {
      const cat = list.find((c) => c.id === id);
      if (!cat) return;
      const res = await updateCategoryRow(id, { is_active: !cat.is_active });
      if (!res.ok) {
        showError(res.error);
        return;
      }
      showSuccess(cat.is_active ? t("admin_cat_msg_deactivated") : t("admin_cat_msg_activated"));
      load();
    },
    [list, load, showError, showSuccess, t]
  );

  return {
    list,
    loading,
    message,
    supabaseAvailable,
    load,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleMoveUp,
    handleMoveDown,
    handleToggleActive,
    showSuccess,
  };
}

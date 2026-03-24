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
import type { CategoryFormPayload, CategoryFormSettingsPayload } from "./CategoryFormModal";

export type CategoryAdminMessage = { type: "success" | "error"; text: string } | null;

export function useCategoryAdmin() {
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
    async (payload: CategoryFormPayload, settings: CategoryFormSettingsPayload) => {
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
        return;
      }
      showSuccess("카테고리가 추가되었습니다.");
      load();
    },
    [load, showError, showSuccess]
  );

  const handleUpdate = useCallback(
    async (id: string, payload: CategoryFormPayload, settings: CategoryFormSettingsPayload) => {
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
        return;
      }
      showSuccess("저장되었습니다.");
      load();
    },
    [load, showError, showSuccess]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("이 카테고리를 삭제하시겠습니까? (하위에 게시물이 있으면 삭제되지 않고 변경을 안내합니다.)")) return;
      const res = await deleteCategory(id);
      if (!res.ok) {
        showError(res.error);
        return;
      }
      showSuccess("삭제되었습니다.");
      load();
    },
    [load, showError, showSuccess]
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
      showSuccess("순서가 변경되었습니다.");
      load();
    },
    [list, load, showError, showSuccess]
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
      showSuccess(cat.is_active ? "미사용으로 변경되었습니다." : "사용으로 변경되었습니다.");
      load();
    },
    [list, load, showError, showSuccess]
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

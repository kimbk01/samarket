"use client";

import { useCallback, useEffect, useState } from "react";
import type { ServiceCategory, ServiceSubcategory } from "@/lib/types/admin-category";
import {
  getServiceCategories,
  getServiceSubcategories,
  toggleServiceCategoryActive,
  toggleServiceSubcategoryActive,
  resetServiceCategories,
} from "@/lib/admin-settings/service-categories-state";
import {
  loadServiceCategoriesFromServer,
  persistServiceCategoriesToServer,
} from "@/lib/admin-settings/service-categories-sync-client";
import { AdminCard } from "@/components/admin/AdminCard";
import { ServiceCategoryTable } from "./ServiceCategoryTable";
import { SubcategoryTable } from "./SubcategoryTable";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminCategoryManagement() {
  const { t } = useI18n();
  const [hydrated, setHydrated] = useState(false);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ServiceSubcategory[]>([]);
  const [parentFilterId, setParentFilterId] = useState<string>("");

  const refreshCategories = useCallback(() => {
    setCategories(getServiceCategories());
  }, []);

  const refreshSubcategories = useCallback(() => {
    setSubcategories(
      parentFilterId ? getServiceSubcategories(parentFilterId) : getServiceSubcategories()
    );
  }, [parentFilterId]);

  useEffect(() => {
    void loadServiceCategoriesFromServer().then((res) => {
      if (res.ok) {
        refreshCategories();
        refreshSubcategories();
      }
      setHydrated(true);
    });
  }, [refreshCategories, refreshSubcategories]);

  useEffect(() => {
    if (hydrated) refreshSubcategories();
  }, [parentFilterId, hydrated, refreshSubcategories]);

  const persistAndRefresh = useCallback(async () => {
    await persistServiceCategoriesToServer();
    refreshCategories();
    refreshSubcategories();
  }, [refreshCategories, refreshSubcategories]);

  const handleCategoryToggle = useCallback(
    (id: string) => {
      toggleServiceCategoryActive(id);
      void persistAndRefresh();
    },
    [persistAndRefresh]
  );

  const handleSubcategoryToggle = useCallback(
    (id: string) => {
      toggleServiceSubcategoryActive(id);
      void persistAndRefresh();
    },
    [persistAndRefresh]
  );

  const handleCategoryEdit = useCallback((_id: string) => {
    // TODO: 모달 또는 인라인 편집
  }, []);

  const handleSubcategoryEdit = useCallback((_id: string) => {
    // TODO: 모달 또는 인라인 편집
  }, []);

  const handleSave = useCallback(() => {
    void persistServiceCategoriesToServer().then((res) => {
      if (res.ok) alert(t("admin_settings_saved"));
    });
  }, [t]);

  const handleReset = useCallback(() => {
    if (!confirm(t("admin_settings_reset_confirm_categories"))) return;
    resetServiceCategories();
    void persistServiceCategoriesToServer().then(() => {
      setCategories(getServiceCategories());
      setSubcategories(getServiceSubcategories(parentFilterId || undefined));
      alert(t("admin_settings_reset_done"));
    });
  }, [parentFilterId, t]);

  if (!hydrated) {
    return (
      <AdminCard>
        <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
      </AdminCard>
    );
  }

  return (
    <div className="space-y-6">
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_settings_category_intro")}</p>

      <AdminCard titleKey="admin_settings_category_top_title">
        <ServiceCategoryTable
          items={categories}
          onToggleActive={handleCategoryToggle}
          onEdit={handleCategoryEdit}
        />
      </AdminCard>

      <AdminCard titleKey="admin_settings_category_sub_title">
        <SubcategoryTable
          items={subcategories}
          parents={categories}
          parentFilterId={parentFilterId}
          onParentFilterChange={setParentFilterId}
          onToggleActive={handleSubcategoryToggle}
          onEdit={handleSubcategoryEdit}
        />
      </AdminCard>

      <div className="flex flex-wrap items-center gap-2 border-t border-sam-border-soft pt-4">
        <button
          type="button"
          onClick={handleSave}
          className="rounded border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
        >
          {t("common_save")}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
        >
          {t("admin_settings_reset")}
        </button>
      </div>
    </div>
  );
}

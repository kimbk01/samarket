"use client";

import { useCallback, useEffect, useState } from "react";
import type { ServiceCategory, ServiceSubcategory } from "@/lib/types/admin-category";
import {
  getServiceCategories,
  getServiceSubcategories,
  toggleServiceCategoryActive,
  toggleServiceSubcategoryActive,
  resetServiceCategories,
} from "@/lib/admin-settings/mock-service-categories";
import { AdminCard } from "@/components/admin/AdminCard";
import { ServiceCategoryTable } from "./ServiceCategoryTable";
import { SubcategoryTable } from "./SubcategoryTable";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminCategoryManagement() {
  const { t } = useI18n();
  const [categories, setCategories] = useState<ServiceCategory[]>(() => getServiceCategories());
  const [subcategories, setSubcategories] = useState<ServiceSubcategory[]>(() =>
    getServiceSubcategories()
  );
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
    refreshSubcategories();
  }, [parentFilterId, refreshSubcategories]);

  const handleCategoryToggle = useCallback(
    (id: string) => {
      toggleServiceCategoryActive(id);
      refreshCategories();
    },
    [refreshCategories]
  );

  const handleSubcategoryToggle = useCallback(
    (id: string) => {
      toggleServiceSubcategoryActive(id);
      refreshSubcategories();
    },
    [refreshSubcategories]
  );

  const handleCategoryEdit = useCallback((_id: string) => {
    // TODO: 모달 또는 인라인 편집
  }, []);

  const handleSubcategoryEdit = useCallback((_id: string) => {
    // TODO: 모달 또는 인라인 편집
  }, []);

  const handleSave = useCallback(() => {
    refreshCategories();
    refreshSubcategories();
    alert(t("admin_settings_saved"));
  }, [refreshCategories, refreshSubcategories, t]);

  const handleReset = useCallback(() => {
    if (!confirm(t("admin_settings_reset_confirm_categories"))) return;
    resetServiceCategories();
    setCategories(getServiceCategories());
    setSubcategories(getServiceSubcategories(parentFilterId || undefined));
    alert(t("admin_settings_reset_done"));
  }, [parentFilterId, t]);

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

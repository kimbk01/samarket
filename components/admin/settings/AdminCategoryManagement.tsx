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

export function AdminCategoryManagement() {
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
    alert("저장되었습니다.");
  }, [refreshCategories, refreshSubcategories]);

  const handleReset = useCallback(() => {
    if (!confirm("카테고리 설정을 초기 상태로 되돌리시겠습니까?")) return;
    resetServiceCategories();
    setCategories(getServiceCategories());
    setSubcategories(getServiceSubcategories(parentFilterId || undefined));
    alert("초기화되었습니다.");
  }, [parentFilterId]);

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-gray-500">
        서비스 상단 카테고리와 하위 카테고리의 노출/정렬을 관리합니다.
      </p>

      <AdminCard title="상단 서비스 카테고리">
        <ServiceCategoryTable
          items={categories}
          onToggleActive={handleCategoryToggle}
          onEdit={handleCategoryEdit}
        />
      </AdminCard>

      <AdminCard title="하위 운영 카테고리">
        <SubcategoryTable
          items={subcategories}
          parents={categories}
          parentFilterId={parentFilterId}
          onParentFilterChange={setParentFilterId}
          onToggleActive={handleSubcategoryToggle}
          onEdit={handleSubcategoryEdit}
        />
      </AdminCard>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={handleSave}
          className="rounded border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700 hover:bg-gray-50"
        >
          저장
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700 hover:bg-gray-50"
        >
          초기화
        </button>
      </div>
    </div>
  );
}

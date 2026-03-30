"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getWritableRootCategoriesForWriteLauncher } from "@/lib/categories/getWritableRootCategoriesForWriteLauncher";
import type { CategoryWithSettings } from "@/lib/categories/types";

type WriteCategoryContextValue = {
  /** 포스트 상세 등에서 보고 있는 글의 카테고리 slug → 플로팅 글쓰기 버튼이 이 카테고리로 바로 이동 */
  writeCategorySlug: string | null;
  setWriteCategorySlug: (slug: string | null) => void;
  /**
   * 어드민 메뉴 관리 「글쓰기 런처」(`quick_create_enabled` 등) 반영 목록.
   * `WriteLauncherPanel`·거래 플로팅 다이얼·좌측 FAB 가 동일 데이터를 씁니다.
   */
  launcherRootCategories: CategoryWithSettings[];
  launcherCategoriesLoading: boolean;
  refreshLauncherCategories: () => Promise<void>;
};

const WriteCategoryContext = createContext<WriteCategoryContextValue | null>(null);

export function WriteCategoryProvider({ children }: { children: React.ReactNode }) {
  const [writeCategorySlug, setWriteCategorySlug] = useState<string | null>(null);
  const [launcherRootCategories, setLauncherRootCategories] = useState<CategoryWithSettings[]>([]);
  const [launcherCategoriesLoading, setLauncherCategoriesLoading] = useState(true);

  const refreshLauncherCategories = useCallback(async () => {
    setLauncherCategoriesLoading(true);
    try {
      const list = await getWritableRootCategoriesForWriteLauncher();
      setLauncherRootCategories(list);
    } finally {
      setLauncherCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLauncherCategories();
  }, [refreshLauncherCategories]);

  return (
    <WriteCategoryContext.Provider
      value={{
        writeCategorySlug,
        setWriteCategorySlug,
        launcherRootCategories,
        launcherCategoriesLoading,
        refreshLauncherCategories,
      }}
    >
      {children}
    </WriteCategoryContext.Provider>
  );
}

export function useWriteCategory() {
  const ctx = useContext(WriteCategoryContext);
  return ctx;
}

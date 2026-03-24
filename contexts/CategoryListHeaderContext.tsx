"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";

export type CategoryListStickyConfig = {
  backHref?: string;
  category: CategoryWithSettings | null;
  showTypeBadge?: boolean;
};

type CategoryListHeaderContextValue = {
  config: CategoryListStickyConfig | null;
  setConfig: (next: CategoryListStickyConfig | null) => void;
};

const CategoryListHeaderContext = createContext<CategoryListHeaderContextValue | null>(null);

export function CategoryListHeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<CategoryListStickyConfig | null>(null);
  const setConfig = useCallback((next: CategoryListStickyConfig | null) => {
    setConfigState(next);
  }, []);

  const value = useMemo(() => ({ config, setConfig }), [config, setConfig]);

  return <CategoryListHeaderContext.Provider value={value}>{children}</CategoryListHeaderContext.Provider>;
}

export function useCategoryListStickyConfig() {
  const ctx = useContext(CategoryListHeaderContext);
  return ctx?.config ?? null;
}

/** CategoryListLayout 전용: 활성일 때만 상단 2줄 헤더 등록, 언마운트 시 해제 */
export function useRegisterCategoryListStickyHeader(
  enabled: boolean,
  backHref: string | undefined,
  category: CategoryWithSettings | null,
  showTypeBadge = true,
) {
  const ctx = useContext(CategoryListHeaderContext);
  const setConfig = ctx?.setConfig;

  useEffect(() => {
    if (!setConfig) return;
    if (!enabled) {
      setConfig(null);
      return;
    }
    setConfig({ backHref, category, showTypeBadge });
    return () => setConfig(null);
  }, [setConfig, enabled, backHref, category, showTypeBadge]);
}

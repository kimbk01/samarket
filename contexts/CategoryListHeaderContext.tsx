"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  tradeSecondaryTabs: ReactNode | null;
  setTradeSecondaryTabs: (next: ReactNode | null) => void;
};

const CategoryListHeaderContext = createContext<CategoryListHeaderContextValue | null>(null);

export function CategoryListHeaderProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<CategoryListStickyConfig | null>(null);
  const [tradeSecondaryTabs, setTradeSecondaryTabsState] = useState<ReactNode | null>(null);
  const setConfig = useCallback((next: CategoryListStickyConfig | null) => {
    setConfigState((prev) => (Object.is(prev, next) ? prev : next));
  }, []);
  const setTradeSecondaryTabs = useCallback((next: ReactNode | null) => {
    setTradeSecondaryTabsState((prev) => (Object.is(prev, next) ? prev : next));
  }, []);

  const value = useMemo(
    () => ({ config, setConfig, tradeSecondaryTabs, setTradeSecondaryTabs }),
    [config, setConfig, tradeSecondaryTabs, setTradeSecondaryTabs]
  );

  return <CategoryListHeaderContext.Provider value={value}>{children}</CategoryListHeaderContext.Provider>;
}

export function useCategoryListStickyConfig() {
  const ctx = useContext(CategoryListHeaderContext);
  return ctx?.config ?? null;
}

export function useTradeSecondaryTabs() {
  const ctx = useContext(CategoryListHeaderContext);
  return ctx?.tradeSecondaryTabs ?? null;
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
  const categoryRef = useRef(category);
  categoryRef.current = category;
  const categoryIdentity = category?.id ?? "";

  useEffect(() => {
    if (!setConfig) return;
    if (!enabled) {
      setConfig(null);
      return;
    }
    setConfig({ backHref, category: categoryRef.current, showTypeBadge });
    return () => setConfig(null);
  }, [setConfig, enabled, backHref, categoryIdentity, showTypeBadge]);
}

/**
 * @param syncKey `node` 레퍼런스만으로는 잡히지 않는 갱신(칩·topic·구인구직 탭 등)을 이 값이 바뀔 때 다시 반영.
 * 생략 시 기존처럼 `node` 참조 변화에만 이펙트가 반응한다.
 */
export function useRegisterTradeSecondaryTabs(
  enabled: boolean,
  node: ReactNode | null,
  syncKey?: string | number
) {
  const ctx = useContext(CategoryListHeaderContext);
  const setTradeSecondaryTabs = ctx?.setTradeSecondaryTabs;
  const nodeRef = useRef(node);
  nodeRef.current = node;
  const driver = syncKey !== undefined ? syncKey : node;

  useEffect(() => {
    if (!setTradeSecondaryTabs) return;
    if (!enabled || nodeRef.current == null) {
      setTradeSecondaryTabs(null);
      return;
    }
    setTradeSecondaryTabs(nodeRef.current);
    return () => setTradeSecondaryTabs(null);
  }, [enabled, driver, setTradeSecondaryTabs]);
}

export const useTradeMenuSecondaryHeader = useTradeSecondaryTabs;
export const useRegisterTradeMenuSecondaryHeader = useRegisterTradeSecondaryTabs;

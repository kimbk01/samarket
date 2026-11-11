"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useHubActive } from "@/lib/layout/hub-active-context";
/**
 * 거래 마켓 2단 탭을 전역 헤더 크롬에 올리는 컨텍스트.
 * (카테고리 제목 서브헤더 설정은 크롬 S2 2026-11-02 에서 제거 — 제목은 `useRegisterMainTier1Header`)
 */
type CategoryListHeaderContextValue = {
  tradeSecondaryTabs: ReactNode | null;
  setTradeSecondaryTabs: (next: ReactNode | null) => void;
};

const CategoryListHeaderContext = createContext<CategoryListHeaderContextValue | null>(null);

export function CategoryListHeaderProvider({ children }: { children: ReactNode }) {
  const [tradeSecondaryTabs, setTradeSecondaryTabsState] = useState<ReactNode | null>(null);
  const setTradeSecondaryTabs = useCallback((next: ReactNode | null) => {
    setTradeSecondaryTabsState((prev) => (Object.is(prev, next) ? prev : next));
  }, []);

  const value = useMemo(
    () => ({ tradeSecondaryTabs, setTradeSecondaryTabs }),
    [tradeSecondaryTabs, setTradeSecondaryTabs]
  );

  return <CategoryListHeaderContext.Provider value={value}>{children}</CategoryListHeaderContext.Provider>;
}

export function useTradeSecondaryTabs() {
  const ctx = useContext(CategoryListHeaderContext);
  return ctx?.tradeSecondaryTabs ?? null;
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
  const hubActive = useHubActive();
  const ctx = useContext(CategoryListHeaderContext);
  const setTradeSecondaryTabs = ctx?.setTradeSecondaryTabs;
  const nodeRef = useRef(node);
  nodeRef.current = node;
  const driver = syncKey !== undefined ? syncKey : node;

  useLayoutEffect(() => {
    if (!hubActive) return;
    if (!setTradeSecondaryTabs) return;
    if (!enabled || nodeRef.current == null) {
      setTradeSecondaryTabs(null);
      return;
    }
    setTradeSecondaryTabs(nodeRef.current);
    return () => setTradeSecondaryTabs(null);
  }, [hubActive, enabled, driver, setTradeSecondaryTabs]);
}

export const useTradeMenuSecondaryHeader = useTradeSecondaryTabs;
export const useRegisterTradeMenuSecondaryHeader = useRegisterTradeSecondaryTabs;

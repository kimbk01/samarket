"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getWritableRootCategoriesForWriteLauncher } from "@/lib/categories/getWritableRootCategoriesForWriteLauncher";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  cancelScheduledWhenBrowserIdle,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";

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
  /**
   * 런처 시트를 열 때 호출 — 예약된 지연 로드를 취소하고 즉시 조회(첫 페인트와 Supabase 경쟁 완화).
   */
  ensureLauncherCategoriesLoaded: () => void;
};

const WriteCategoryContext = createContext<WriteCategoryContextValue | null>(null);

export function WriteCategoryProvider({ children }: { children: React.ReactNode }) {
  const [writeCategorySlug, setWriteCategorySlug] = useState<string | null>(null);
  const [launcherRootCategories, setLauncherRootCategories] = useState<CategoryWithSettings[]>([]);
  const [launcherCategoriesLoading, setLauncherCategoriesLoading] = useState(true);
  const deferredIdleIdRef = useRef<number>(-1);
  const initialFetchAttemptedRef = useRef(false);

  const refreshLauncherCategories = useCallback(async () => {
    await runSingleFlight("write-launcher-categories", async () => {
      setLauncherCategoriesLoading(true);
      try {
        const list = await getWritableRootCategoriesForWriteLauncher();
        setLauncherRootCategories(list);
      } finally {
        initialFetchAttemptedRef.current = true;
        setLauncherCategoriesLoading(false);
      }
    });
  }, []);

  const ensureLauncherCategoriesLoaded = useCallback(() => {
    if (deferredIdleIdRef.current >= 0) {
      cancelScheduledWhenBrowserIdle(deferredIdleIdRef.current);
      deferredIdleIdRef.current = -1;
    }
    if (initialFetchAttemptedRef.current) return;
    void refreshLauncherCategories();
  }, [refreshLauncherCategories]);

  useEffect(() => {
    deferredIdleIdRef.current = scheduleWhenBrowserIdle(() => {
      deferredIdleIdRef.current = -1;
      if (initialFetchAttemptedRef.current) return;
      void refreshLauncherCategories();
    }, 650);
    return () => {
      if (deferredIdleIdRef.current >= 0) {
        cancelScheduledWhenBrowserIdle(deferredIdleIdRef.current);
        deferredIdleIdRef.current = -1;
      }
    };
  }, [refreshLauncherCategories]);

  return (
    <WriteCategoryContext.Provider
      value={{
        writeCategorySlug,
        setWriteCategorySlug,
        launcherRootCategories,
        launcherCategoriesLoading,
        refreshLauncherCategories,
        ensureLauncherCategoriesLoaded,
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

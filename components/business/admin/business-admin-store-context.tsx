"use client";

import { createContext, useContext } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

export type BusinessAdminStoreContextValue = {
  storeRow: StoreRow | null;
  reloadStores: () => Promise<void>;
  /**
   * 운영 헤더 뒤로(고정 `backHref` 링크) 직전에 호출. `true`를 반환하면 기본 이동을 막는다.
   * 예: 카테고리 편집 화면에서 목록으로만 돌아가기.
   */
  registerOwnerAdminHeaderBackIntercept: (handler: (() => boolean) | null) => void;
};

const Ctx = createContext<BusinessAdminStoreContextValue | null>(null);

export function BusinessAdminStoreProvider({
  value,
  children,
}: {
  value: BusinessAdminStoreContextValue;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBusinessAdminStore(): BusinessAdminStoreContextValue | null {
  return useContext(Ctx);
}

"use client";

import { createContext, useContext } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

export type BusinessAdminStoreContextValue = {
  storeRow: StoreRow | null;
  reloadStores: () => Promise<void>;
  /**
   * 운영 헤더 뒤로(히스토리·폴백 이동) 직전에 호출. `true`를 반환하면 기본 이동을 막는다.
   * 예: 기본 정보 미저장 이탈 확인, 카테고리 편집 가드.
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

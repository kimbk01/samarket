"use client";

import { createContext, useContext } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

export type BusinessAdminStoreContextValue = {
  storeRow: StoreRow | null;
  reloadStores: () => Promise<void>;
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

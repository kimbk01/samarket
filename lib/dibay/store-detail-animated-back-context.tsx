"use client";

import { createContext, useContext, type ReactNode } from "react";

export type StoreDetailAnimatedBackFn = (navigate: () => void) => void;

const StoreDetailAnimatedBackContext = createContext<StoreDetailAnimatedBackFn | null>(null);

export function StoreDetailAnimatedBackProvider({
  value,
  children,
}: {
  value: StoreDetailAnimatedBackFn;
  children: ReactNode;
}) {
  return (
    <StoreDetailAnimatedBackContext.Provider value={value}>{children}</StoreDetailAnimatedBackContext.Provider>
  );
}

export function useStoreDetailAnimatedBack(): StoreDetailAnimatedBackFn | null {
  return useContext(StoreDetailAnimatedBackContext);
}

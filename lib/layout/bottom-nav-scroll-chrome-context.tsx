"use client";

import { createContext, useContext, type ReactNode } from "react";

/** `useBottomNavScrollHide` 결과 — FAB 등 하단 크롬이 동일 타이밍을 따른다 */
const BottomNavScrollChromeContext = createContext(false);

export function BottomNavScrollChromeProvider({
  hidden,
  children,
}: {
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <BottomNavScrollChromeContext.Provider value={hidden}>{children}</BottomNavScrollChromeContext.Provider>
  );
}

export function useBottomNavScrollChromeHidden(): boolean {
  return useContext(BottomNavScrollChromeContext);
}

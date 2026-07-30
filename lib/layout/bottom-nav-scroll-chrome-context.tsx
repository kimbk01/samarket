"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * BottomNav chrome SSOT.
 * - `hidden`: scroll-hide visual only (transform). Never drives layout clearance.
 * - `occupiesClearance`: `showBottomNavEffective` mount only — never gated by scroll-hide.
 * DO NOT add keyboard / Zustand / section switches.
 */
export type BottomNavScrollChromeValue = {
  hidden: boolean;
  occupiesClearance: boolean;
};

const DEFAULT_VALUE: BottomNavScrollChromeValue = {
  hidden: false,
  /** Outside provider — no reserved clearance (room / unset). */
  occupiesClearance: false,
};

const BottomNavScrollChromeContext = createContext<BottomNavScrollChromeValue>(DEFAULT_VALUE);

export function BottomNavScrollChromeProvider({
  hidden,
  occupiesClearance,
  children,
}: {
  hidden: boolean;
  /** Mount authority only: `showBottomNavEffective` (never gated by scroll-hide) */
  occupiesClearance: boolean;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ hidden, occupiesClearance }),
    [hidden, occupiesClearance]
  );
  return (
    <BottomNavScrollChromeContext.Provider value={value}>{children}</BottomNavScrollChromeContext.Provider>
  );
}

export function useBottomNavScrollChromeHidden(): boolean {
  return useContext(BottomNavScrollChromeContext).hidden;
}

/** True while main BottomNav is mounted — independent of scroll-hide. */
export function useBottomNavOccupiesClearance(): boolean {
  return useContext(BottomNavScrollChromeContext).occupiesClearance;
}

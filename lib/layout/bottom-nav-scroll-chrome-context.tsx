"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * BottomNav chrome SSOT for scroll-hide + body clearance.
 * `occupiesClearance` = mounted BottomNav AND not scroll-hidden.
 * DO NOT add keyboard / Zustand switches — route + scroll only.
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
  /** `showBottomNavEffective && !hidden` — single clearance authority */
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

/** True only while main BottomNav is mounted and not scroll-hidden. */
export function useBottomNavOccupiesClearance(): boolean {
  return useContext(BottomNavScrollChromeContext).occupiesClearance;
}

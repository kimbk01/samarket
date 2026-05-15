"use client";

import { createContext, useContext, type ReactNode } from "react";

/** 0=PASS0 shell (external) · 1=header+composer · 2=visible viewport rows · 3=idle full list+trade chrome */
export type CmRoomPhase2HydrationPass = 0 | 1 | 2 | 3;

const CmRoomPhase2HydrationContext = createContext<CmRoomPhase2HydrationPass>(2);

export function CmRoomPhase2HydrationProvider({
  pass,
  children,
}: {
  pass: CmRoomPhase2HydrationPass;
  children: ReactNode;
}) {
  return (
    <CmRoomPhase2HydrationContext.Provider value={pass}>{children}</CmRoomPhase2HydrationContext.Provider>
  );
}

export function useCmRoomPhase2HydrationPass(): CmRoomPhase2HydrationPass {
  return useContext(CmRoomPhase2HydrationContext);
}

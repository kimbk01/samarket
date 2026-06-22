"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type MypageProfileSheetId =
  | "settings"
  | "profile-edit"
  | "dibay-id"
  | "phone"
  | "address"
  | null;

type MypageProfileSheetsContextValue = {
  activeSheet: MypageProfileSheetId;
  openSheet: (id: Exclude<MypageProfileSheetId, null>) => void;
  closeSheet: () => void;
  onProfileUpdated: () => void;
  setOnProfileUpdated: (fn: () => void) => void;
};

const MypageProfileSheetsContext = createContext<MypageProfileSheetsContextValue | null>(null);

export function MypageProfileSheetsProvider({ children }: { children: ReactNode }) {
  const [activeSheet, setActiveSheet] = useState<MypageProfileSheetId>(null);
  const refreshHandlerRef = useRef<(() => void) | null>(null);

  const openSheet = useCallback((id: Exclude<MypageProfileSheetId, null>) => {
    setActiveSheet(id);
  }, []);

  const closeSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  const onProfileUpdated = useCallback(() => {
    refreshHandlerRef.current?.();
  }, []);

  const setOnProfileUpdated = useCallback((fn: () => void) => {
    refreshHandlerRef.current = fn;
  }, []);

  const value = useMemo(
    () => ({
      activeSheet,
      openSheet,
      closeSheet,
      onProfileUpdated,
      setOnProfileUpdated,
    }),
    [activeSheet, openSheet, closeSheet, onProfileUpdated, setOnProfileUpdated],
  );

  return (
    <MypageProfileSheetsContext.Provider value={value}>{children}</MypageProfileSheetsContext.Provider>
  );
}

export function useMypageProfileSheets(): MypageProfileSheetsContextValue {
  const ctx = useContext(MypageProfileSheetsContext);
  if (!ctx) {
    throw new Error("useMypageProfileSheets must be used within MypageProfileSheetsProvider");
  }
  return ctx;
}

export function useMypageProfileSheetsOptional(): MypageProfileSheetsContextValue | null {
  return useContext(MypageProfileSheetsContext);
}

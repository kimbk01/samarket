"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

type Ctx = {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  open: () => void;
  requestClose: () => void;
  setRequestClose: (fn: (() => void) | null) => void;
};

const C = createContext<Ctx | null>(null);

export function useTradeHeaderTradeHistoryStack() {
  const v = useContext(C);
  if (!v) throw new Error("useTradeHeaderTradeHistoryStack requires TradeHeaderTradeHistoryStackProvider");
  return v;
}

export function useTradeHeaderTradeHistoryStackOptional(): Ctx | null {
  return useContext(C);
}

/**
 * 거래 홈·마켓 1단 헤더 `+` → **거래 내역**: URL 이동 대신 풀뷰포트 슬라이드 패널
 * (`TradeHistoryFromHeaderStack`).
 */
export function TradeHeaderTradeHistoryStackProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const requestCloseRef = useRef<(() => void) | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const setRequestClose = useCallback((fn: (() => void) | null) => {
    requestCloseRef.current = fn;
  }, []);
  const requestClose = useCallback(() => {
    requestCloseRef.current?.();
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      setIsOpen,
      open,
      requestClose,
      setRequestClose,
    }),
    [isOpen, open, requestClose, setRequestClose]
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

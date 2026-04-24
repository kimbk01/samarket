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
  /** `PhilifeMessengerFromHeaderStack` 가 `setRequestClose` 로 등록한 애니메이션 닫힘 */
  requestClose: () => void;
  setRequestClose: (fn: (() => void) | null) => void;
};

const C = createContext<Ctx | null>(null);

export function usePhilifeHeaderMessengerStack() {
  const v = useContext(C);
  if (!v) throw new Error("usePhilifeHeaderMessengerStack requires PhilifeHeaderMessengerStackProvider");
  return v;
}

export function usePhilifeHeaderMessengerStackOptional(): Ctx | null {
  return useContext(C);
}

/**
 * 필라이프 헤더 **메신저(아이콘)** 전용: `router`로 `/community-messenger`에 가지 않고
 * `PhilifeMessengerFromHeaderStack`이 **풀뷰포트 `fixed` 오버레이**로 `section=chats` 셸을 연다(하단 탭
 * 메신저 풀 경로와 별도 UX; 1·2단 `AppStickyHeader`까지 가림).
 */
export function PhilifeHeaderMessengerStackProvider({ children }: { children: ReactNode }) {
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

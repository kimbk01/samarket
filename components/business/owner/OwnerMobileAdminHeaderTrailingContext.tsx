"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TrailingCtx = {
  trailing: ReactNode | null;
  setTrailing: (node: ReactNode | null) => void;
};

const OwnerMobileAdminHeaderTrailingContext = createContext<TrailingCtx | null>(null);

export function OwnerMobileAdminHeaderTrailingProvider({ children }: { children: ReactNode }) {
  const [trailing, setTrailing] = useState<ReactNode | null>(null);
  const value = useMemo(() => ({ trailing, setTrailing }), [trailing]);
  return (
    <OwnerMobileAdminHeaderTrailingContext.Provider value={value}>
      {children}
    </OwnerMobileAdminHeaderTrailingContext.Provider>
  );
}

export function useOwnerMobileAdminHeaderTrailing() {
  return useContext(OwnerMobileAdminHeaderTrailingContext);
}

/** 서브페이지(주문 관리 등) — 셸 헤더 우측에 검색·필터 등 추가 */
export function useRegisterOwnerMobileAdminHeaderTrailing(node: ReactNode | null) {
  const ctx = useOwnerMobileAdminHeaderTrailing();
  useEffect(() => {
    if (!ctx) return;
    ctx.setTrailing(node);
    return () => ctx.setTrailing(null);
  }, [ctx, node]);
}

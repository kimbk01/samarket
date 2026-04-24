"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MypageInfoHubSidePanel } from "@/components/mypage/MypageInfoHubSidePanel";

type Ctx = {
  open: boolean;
  openInfoHub: () => void;
  closeInfoHub: () => void;
};

const MypageInfoHubPanelContext = createContext<Ctx | null>(null);

export function useMypageInfoHubPanel(): Ctx {
  const v = useContext(MypageInfoHubPanelContext);
  if (!v) {
    throw new Error("useMypageInfoHubPanel must be used within MypageInfoHubPanelProvider");
  }
  return v;
}

/**
 * 1단 헤더 **햄버거**로 열리는 `앱·서비스 설정` 좌측 풀하이트 패널(페이스북형 좌→우 전개).
 * `(main)` `MainAppProviderTree`에서만 마운트.
 */
export function MypageInfoHubPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openInfoHub = useCallback(() => setOpen(true), []);
  const closeInfoHub = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ open, openInfoHub, closeInfoHub }),
    [open, openInfoHub, closeInfoHub]
  );
  return (
    <MypageInfoHubPanelContext.Provider value={value}>
      {children}
      <MypageInfoHubSidePanel open={open} onClose={closeInfoHub} />
    </MypageInfoHubPanelContext.Provider>
  );
}

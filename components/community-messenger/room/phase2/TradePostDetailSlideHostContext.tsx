"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

type TradePostDetailSlideHostValue = {
  openPostDetail: (postId: string) => void;
  closeSlide: () => void;
};

const TradePostDetailSlideHostContext = createContext<TradePostDetailSlideHostValue | null>(null);

export function TradePostDetailSlideHostProvider({
  openPostDetail,
  closeSlide,
  children,
}: {
  openPostDetail: (postId: string) => void;
  closeSlide: () => void;
  children: ReactNode;
}) {
  /** P-4: 매 렌더 새 객체면 구독하는 입력창이 다시 렌더됨 */
  const value = useMemo(() => ({ openPostDetail, closeSlide }), [openPostDetail, closeSlide]);
  return (
    <TradePostDetailSlideHostContext.Provider value={value}>
      {children}
    </TradePostDetailSlideHostContext.Provider>
  );
}

export function useTradePostDetailSlideHost(): TradePostDetailSlideHostValue | null {
  return useContext(TradePostDetailSlideHostContext);
}

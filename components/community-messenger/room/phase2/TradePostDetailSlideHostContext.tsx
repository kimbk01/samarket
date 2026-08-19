"use client";

import { createContext, useContext, type ReactNode } from "react";

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
  return (
    <TradePostDetailSlideHostContext.Provider value={{ openPostDetail, closeSlide }}>
      {children}
    </TradePostDetailSlideHostContext.Provider>
  );
}

export function useTradePostDetailSlideHost(): TradePostDetailSlideHostValue | null {
  return useContext(TradePostDetailSlideHostContext);
}

"use client";

import { createContext, useContext, type ReactNode } from "react";

type BuyerOrderChatSlideHostValue = {
  closeSlide: () => void;
};

const BuyerOrderChatSlideHostContext = createContext<BuyerOrderChatSlideHostValue | null>(null);

export function BuyerOrderChatSlideHostProvider({
  closeSlide,
  children,
}: {
  closeSlide: () => void;
  children: ReactNode;
}) {
  return (
    <BuyerOrderChatSlideHostContext.Provider value={{ closeSlide }}>
      {children}
    </BuyerOrderChatSlideHostContext.Provider>
  );
}

export function useBuyerOrderChatSlideHost(): BuyerOrderChatSlideHostValue | null {
  return useContext(BuyerOrderChatSlideHostContext);
}

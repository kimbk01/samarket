"use client";

import { createContext, useContext, type ReactNode } from "react";

type OwnerOrderChatSlideHostValue = {
  closeSlide: () => void;
};

const OwnerOrderChatSlideHostContext = createContext<OwnerOrderChatSlideHostValue | null>(null);

export function OwnerOrderChatSlideHostProvider({
  closeSlide,
  children,
}: {
  closeSlide: () => void;
  children: ReactNode;
}) {
  return (
    <OwnerOrderChatSlideHostContext.Provider value={{ closeSlide }}>
      {children}
    </OwnerOrderChatSlideHostContext.Provider>
  );
}

export function useOwnerOrderChatSlideHost(): OwnerOrderChatSlideHostValue | null {
  return useContext(OwnerOrderChatSlideHostContext);
}

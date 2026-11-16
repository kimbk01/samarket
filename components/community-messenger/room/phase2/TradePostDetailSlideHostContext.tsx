"use client";

import { createContext, useContext, type ReactNode } from "react";

type TradePostDetailSlideHostValue = {
  openPostDetail: (postId: string) => void;
  closeSlide: () => void;
  /** 슬라이드를 띄운 메신저 방 id — 「채팅 이어가기」 대상이 같으면 이동 없이 닫는다 */
  hostMessengerRoomId: string;
};

const TradePostDetailSlideHostContext = createContext<TradePostDetailSlideHostValue | null>(null);

export function TradePostDetailSlideHostProvider({
  openPostDetail,
  closeSlide,
  hostMessengerRoomId,
  children,
}: {
  openPostDetail: (postId: string) => void;
  closeSlide: () => void;
  hostMessengerRoomId: string;
  children: ReactNode;
}) {
  return (
    <TradePostDetailSlideHostContext.Provider value={{ openPostDetail, closeSlide, hostMessengerRoomId }}>
      {children}
    </TradePostDetailSlideHostContext.Provider>
  );
}

export function useTradePostDetailSlideHost(): TradePostDetailSlideHostValue | null {
  return useContext(TradePostDetailSlideHostContext);
}

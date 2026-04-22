"use client";

import { createContext, useContext } from "react";

/** 모바일에서 visualViewport 기반 셸 높이를 쓸 때, 푸터 `useMobileKeyboardInset` 이중 보정 방지 */
export type MessengerRoomMobileViewportContextValue = {
  /** true면 상위가 이미 보이는 뷰포트 높이에 맞춤 — 푸터는 safe-area+기본 여백만 */
  keyboardOverlapSuppressed: boolean;
  /** 거래 도크 방: 키보드·포커스로 상단 거래 UI 축소·하단 탭 숨김 동기화 */
  tradeKeyboardChromeOpen: boolean;
};

const MessengerRoomMobileViewportContext = createContext<MessengerRoomMobileViewportContextValue>({
  keyboardOverlapSuppressed: false,
  tradeKeyboardChromeOpen: false,
});

export const MessengerRoomMobileViewportProvider = MessengerRoomMobileViewportContext.Provider;

export function useMessengerRoomMobileViewport(): MessengerRoomMobileViewportContextValue {
  return useContext(MessengerRoomMobileViewportContext);
}

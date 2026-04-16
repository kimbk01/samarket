"use client";

import { createContext, useContext } from "react";

/** 모바일에서 visualViewport 기반 셸 높이를 쓸 때, 푸터 `useMobileKeyboardInset` 이중 보정 방지 */
export type MessengerRoomMobileViewportContextValue = {
  /** true면 상위가 이미 보이는 뷰포트 높이에 맞춤 — 푸터는 safe-area+기본 여백만 */
  keyboardOverlapSuppressed: boolean;
};

const MessengerRoomMobileViewportContext = createContext<MessengerRoomMobileViewportContextValue>({
  keyboardOverlapSuppressed: false,
});

export const MessengerRoomMobileViewportProvider = MessengerRoomMobileViewportContext.Provider;

export function useMessengerRoomMobileViewport(): MessengerRoomMobileViewportContextValue {
  return useContext(MessengerRoomMobileViewportContext);
}

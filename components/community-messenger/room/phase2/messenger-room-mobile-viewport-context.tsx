"use client";

import { createContext, useContext } from "react";

/** 모바일에서 visualViewport 기반 셸 높이를 쓸 때, 푸터 `useMobileKeyboardInset` 이중 보정 방지 */
export type MessengerRoomMobileViewportContextValue = {
  /** true면 상위가 이미 보이는 뷰포트 높이에 맞춤 — 푸터는 safe-area+기본 여백만 */
  keyboardOverlapSuppressed: boolean;
  /** 메신저 방(일반·그룹·오픈·거래): 키보드·포커스 크롬 — 하단 탭 숨김 동기화, 거래 도크만 UI 축소에 사용 */
  messengerKeyboardChromeOpen: boolean;
};

const MessengerRoomMobileViewportContext = createContext<MessengerRoomMobileViewportContextValue>({
  keyboardOverlapSuppressed: false,
  messengerKeyboardChromeOpen: false,
});

export const MessengerRoomMobileViewportProvider = MessengerRoomMobileViewportContext.Provider;

export function useMessengerRoomMobileViewport(): MessengerRoomMobileViewportContextValue {
  return useContext(MessengerRoomMobileViewportContext);
}

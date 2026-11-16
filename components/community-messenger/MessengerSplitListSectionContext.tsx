"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MessengerSplitListSection } from "@/lib/community-messenger/messenger-entry-origin";

/**
 * 메신저 홈(왼쪽 목록)이 지금 보여 주는 탭·하위 화면 — 홈 안 목록 행·통화 기록이 방을 열 때 방 주소에 싣는다.
 * 홈 밖(거래·주문 목록, 배너 등)에는 Provider 가 없어 null.
 * @see docs/audit/messenger-split-left-list-audit-plan-2026-11-16.md P1
 */
const MessengerSplitListSectionContext = createContext<MessengerSplitListSection | null>(null);

export function MessengerSplitListSectionProvider({
  value,
  children,
}: {
  value: MessengerSplitListSection | null;
  children: ReactNode;
}) {
  return <MessengerSplitListSectionContext.Provider value={value}>{children}</MessengerSplitListSectionContext.Provider>;
}

export function useMessengerSplitListSection(): MessengerSplitListSection | null {
  return useContext(MessengerSplitListSectionContext);
}

"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";

const MessengerRoomPhase2ViewContext = createContext<MessengerRoomPhase2ViewModel | null>(null);

export function MessengerRoomPhase2ViewProvider({
  value,
  children,
}: {
  value: MessengerRoomPhase2ViewModel;
  children: ReactNode;
}) {
  return <MessengerRoomPhase2ViewContext.Provider value={value}>{children}</MessengerRoomPhase2ViewContext.Provider>;
}

export function useMessengerRoomPhase2View(): MessengerRoomPhase2ViewModel {
  const v = useContext(MessengerRoomPhase2ViewContext);
  if (!v) {
    throw new Error("useMessengerRoomPhase2View: MessengerRoomPhase2ViewProvider 가 없습니다.");
  }
  return v;
}

/**
 * 방 시트 계층(⋮ 메뉴·참가자·초대·방 정보·미디어·검색 시트 · 멤버 동작 팝업) 전용 — **매 렌더의 최신 room**.
 * 타임라인용 `MessengerRoomPhase2ViewProvider` 값은 성능 때문에 의존성 20개로 고정돼(`CommunityMessengerRoomClientPhase2Body`)
 * 친구 목록·멤버 보강·초대 후보·초대 링크 상태가 바뀌어도 시트가 몰랐다(2026-11-13 실기: 친구 14명인데 「초대할 친구 없음」).
 * 시트 두 컴포넌트는 memo 가 아니라 Main 렌더마다 다시 그려지므로 이 컨텍스트로 추가 렌더는 없다.
 */
const MessengerRoomPhase2SheetsViewContext = createContext<MessengerRoomPhase2ViewModel | null>(null);

export function MessengerRoomPhase2SheetsViewProvider({
  value,
  children,
}: {
  value: MessengerRoomPhase2ViewModel;
  children: ReactNode;
}) {
  return (
    <MessengerRoomPhase2SheetsViewContext.Provider value={value}>{children}</MessengerRoomPhase2SheetsViewContext.Provider>
  );
}

export function useMessengerRoomPhase2SheetsView(): MessengerRoomPhase2ViewModel {
  const v = useContext(MessengerRoomPhase2SheetsViewContext);
  if (!v) {
    throw new Error("useMessengerRoomPhase2SheetsView: MessengerRoomPhase2SheetsViewProvider 가 없습니다.");
  }
  return v;
}

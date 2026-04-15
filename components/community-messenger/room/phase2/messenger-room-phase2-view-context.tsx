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

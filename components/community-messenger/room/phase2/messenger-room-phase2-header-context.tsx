"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";

export type MessengerRoomPhase2HeaderViewModel = Pick<
  MessengerRoomPhase2ViewModel,
  | "snapshot"
  | "roomHeaderStatus"
  | "router"
  | "isGroupRoom"
  | "t"
  | "roomUnavailable"
  | "outgoingDialLocked"
  | "setActiveSheet"
  | "startManagedDirectCall"
>;

const MessengerRoomPhase2HeaderContext = createContext<MessengerRoomPhase2HeaderViewModel | null>(null);

export function MessengerRoomPhase2HeaderProvider({
  value,
  children,
}: {
  value: MessengerRoomPhase2HeaderViewModel;
  children: ReactNode;
}) {
  return <MessengerRoomPhase2HeaderContext.Provider value={value}>{children}</MessengerRoomPhase2HeaderContext.Provider>;
}

export function useMessengerRoomPhase2HeaderView(): MessengerRoomPhase2HeaderViewModel {
  const value = useContext(MessengerRoomPhase2HeaderContext);
  if (!value) throw new Error("useMessengerRoomPhase2HeaderView: provider missing");
  return value;
}

"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MessengerRoomPhase2ViewModel } from "@/lib/community-messenger/room/phase2/messenger-room-phase2-view-model";

export type MessengerRoomPhase2CallViewModel = Pick<
  MessengerRoomPhase2ViewModel,
  | "returnToCallSessionId"
  | "isGroupRoom"
  | "call"
  | "t"
  | "tt"
  | "permissionGuide"
  | "openCallPermissionHelp"
  | "retryCallDevicePermission"
  | "handleAcceptIncomingCall"
  | "snapshot"
  | "router"
>;

const MessengerRoomPhase2CallContext = createContext<MessengerRoomPhase2CallViewModel | null>(null);

export function MessengerRoomPhase2CallProvider({
  value,
  children,
}: {
  value: MessengerRoomPhase2CallViewModel;
  children: ReactNode;
}) {
  return <MessengerRoomPhase2CallContext.Provider value={value}>{children}</MessengerRoomPhase2CallContext.Provider>;
}

export function useMessengerRoomPhase2CallView(): MessengerRoomPhase2CallViewModel {
  const value = useContext(MessengerRoomPhase2CallContext);
  if (!value) throw new Error("useMessengerRoomPhase2CallView: provider missing");
  return value;
}

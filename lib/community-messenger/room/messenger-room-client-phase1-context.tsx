"use client";

import { createContext, useContext } from "react";
import type { useMessengerRoomClientPhase1 } from "@/lib/community-messenger/room/use-messenger-room-client-phase1";

export type MessengerRoomClientPhase1Value = ReturnType<typeof useMessengerRoomClientPhase1>;

export const MessengerRoomClientPhase1Context = createContext<MessengerRoomClientPhase1Value | null>(null);

export function useMessengerRoomClientPhase1Context(): MessengerRoomClientPhase1Value {
  const v = useContext(MessengerRoomClientPhase1Context);
  if (!v) {
    throw new Error("useMessengerRoomClientPhase1Context: Provider missing");
  }
  return v;
}

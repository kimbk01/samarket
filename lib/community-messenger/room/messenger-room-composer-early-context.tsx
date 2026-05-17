"use client";

import { createContext, useContext } from "react";
import type { MessengerRoomPhase2ComposerViewModel } from "@/components/community-messenger/room/phase2/messenger-room-phase2-composer-context";

export const MessengerRoomComposerEarlyContext = createContext<MessengerRoomPhase2ComposerViewModel | null>(
  null
);

export function useMessengerRoomComposerEarlyContext(): MessengerRoomPhase2ComposerViewModel | null {
  return useContext(MessengerRoomComposerEarlyContext);
}

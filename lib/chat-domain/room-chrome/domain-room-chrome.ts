/**
 * Single room chrome — Phase2Body owns first visible room UI.
 * Domain header/dock builders remain not_wired.
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";

export type DomainRoomChromeSlots = {
  header: "domain_header" | "legacy";
  body: "timeline" | "legacy";
  dock: "domain_dock" | "legacy";
};

export type DomainRoomChromePlan = {
  chatDomain: ChatDomain;
  roomId: string;
  slots: DomainRoomChromeSlots;
  singleFrameActive: boolean;
  status: "not_wired" | "ok";
};

export function planDomainRoomChrome(input: {
  chatDomain: ChatDomain;
  roomId: string;
}): DomainRoomChromePlan | null {
  const roomId = input.roomId.trim();
  if (!roomId) return null;
  return {
    chatDomain: input.chatDomain,
    roomId,
    slots: {
      header: "legacy",
      body: "legacy",
      dock: "legacy",
    },
    singleFrameActive: true,
    status: "ok",
  };
}

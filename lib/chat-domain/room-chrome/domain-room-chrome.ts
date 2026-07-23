/**
 * Phase I — single room chrome frame contract (1단).
 * Product shells remain; this is the cutover target API.
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
  /** true only after product mounts single frame and Pass shells are unused. */
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
    singleFrameActive: false,
    status: "not_wired",
  };
}

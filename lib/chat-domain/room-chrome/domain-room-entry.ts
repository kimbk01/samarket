/**
 * Domain room entry — single chrome after fake-shell removal.
 * DO NOT reintroduce ShellChromeFrame as first room paint.
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import { buildDomainRoomRoute } from "@/lib/chat-domain/push/domain-room-route";

export type DomainRoomEntryRequest = {
  chatDomain: ChatDomain;
  roomId: string;
};

export type DomainRoomEntryPlan = {
  chatDomain: ChatDomain;
  roomId: string;
  href: string;
  chromeMode: "single_frame" | "legacy_multi_shell";
  status: "not_wired" | "ok";
};

export function planDomainRoomEntry(input: DomainRoomEntryRequest): DomainRoomEntryPlan | null {
  const roomId = input.roomId.trim();
  if (!roomId) return null;
  const href = buildDomainRoomRoute({ chatDomain: input.chatDomain, roomId });
  if (!href) return null;
  return {
    chatDomain: input.chatDomain,
    roomId,
    href,
    chromeMode: "single_frame",
    status: "ok",
  };
}

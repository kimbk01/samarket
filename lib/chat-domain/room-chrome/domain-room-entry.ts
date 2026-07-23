/**
 * Phase I — Domain room entry path (contract).
 * Product still uses CommunityMessengerRoomPageClientEntry → RouteEntryShell stack.
 * DO NOT: replace entry tree · delete Pass/Deferred shells (Phase J).
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
  /** In-app path — same as push route for CM ledger rooms. */
  href: string;
  /**
   * Target chrome: single frame after Phase I cutover.
   * Current product: multi-shell (RouteEntry → Gate → Pass0/1 → Stable → Body).
   */
  chromeMode: "single_frame" | "legacy_multi_shell";
  status: "not_wired" | "ok";
};

/**
 * Plan Domain room entry. Until cutover, chromeMode stays legacy_multi_shell + not_wired.
 */
export function planDomainRoomEntry(input: DomainRoomEntryRequest): DomainRoomEntryPlan | null {
  const roomId = input.roomId.trim();
  if (!roomId) return null;
  const href = buildDomainRoomRoute({ chatDomain: input.chatDomain, roomId });
  if (!href) return null;
  return {
    chatDomain: input.chatDomain,
    roomId,
    href,
    chromeMode: "legacy_multi_shell",
    status: "not_wired",
  };
}

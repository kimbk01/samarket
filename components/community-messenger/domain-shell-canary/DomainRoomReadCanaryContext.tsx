"use client";

import { createContext, useContext } from "react";
import type { DomainRoomHeaderChrome } from "@/components/community-messenger/domain-shell-canary/domain-room-header-chrome-client";

export type DomainRoomCanaryHeader =
  | {
      kind: "general_peer";
      title: string;
      avatarUrl: string | null;
      chatDomain: "general_direct";
      domainIdentityKey: string;
    }
  | {
      kind: "group";
      title: string;
      avatarUrl: string | null;
      memberCount: number;
      chatDomain: "group";
      domainIdentityKey: string;
    }
  | {
      kind: "trade";
      /** Primary: viewer-relative counterparty */
      title: string;
      avatarUrl: string | null;
      peerLabel: string | null;
      productTitle: string;
      productImageUrl: string | null;
      itemId: string | null;
      productChatId: string | null;
      chatDomain: "trade";
      domainIdentityKey: string;
    }
  | {
      kind: "buyer_store";
      title: string;
      avatarUrl: string | null;
      orderId: string | null;
      orderStatusLabel: string | null;
      chatDomain: "store_order";
      domainIdentityKey: string;
    }
  | {
      kind: "owner_buyer_peer";
      title: string;
      avatarUrl: string | null;
      orderId: string | null;
      orderStatusLabel: string | null;
      chatDomain: "store_order";
      domainIdentityKey: string;
    };

/** Full Domain room presentation authority (Read Surface Canary — room). */
export type DomainRoomPresentation = {
  authority: "domain_room_presentation_canary";
  roomId: string;
  chatDomain: DomainRoomCanaryHeader["chatDomain"];
  domainIdentityKey: string;
  header: DomainRoomCanaryHeader;
  /** Domain Header Factory chrome — timeline/sheet must consume this, not General roomType */
  chrome: DomainRoomHeaderChrome;
};

const DomainRoomReadCanaryContext = createContext<DomainRoomPresentation | null>(null);

/**
 * `presentation` is nullable so the Provider can wrap children unconditionally (same tree shape
 * whether the gate is loading/legacy/domain) — conditionally mounting/unmounting the Provider
 * itself would remount everything beneath it (Phase 3 room-entry waterfall fix requirement:
 * resolving Domain presentation must not remount BootstrapGate/RoomClient).
 */
export function DomainRoomReadCanaryProvider({
  presentation,
  children,
}: {
  presentation: DomainRoomPresentation | null;
  children: React.ReactNode;
}) {
  return (
    <DomainRoomReadCanaryContext.Provider value={presentation}>
      {children}
    </DomainRoomReadCanaryContext.Provider>
  );
}

export function useDomainRoomPresentation(): DomainRoomPresentation | null {
  return useContext(DomainRoomReadCanaryContext);
}

export function useDomainRoomReadCanaryHeader(): DomainRoomCanaryHeader | null {
  return useContext(DomainRoomReadCanaryContext)?.header ?? null;
}

export function useDomainRoomHeaderChrome(): DomainRoomHeaderChrome | null {
  return useContext(DomainRoomReadCanaryContext)?.chrome ?? null;
}

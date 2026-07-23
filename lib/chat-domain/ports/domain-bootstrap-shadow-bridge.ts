/**
 * STEP1 bridge — CM Legacy bootstrap may schedule Domain Shadow without
 * statically importing @/lib/messenger (architecture boundary).
 *
 * Shadow remains diagnose-only (UI/cache/badge/notification/merge 0).
 */
export type DomainBootstrapShadowBridgeLegacy = Readonly<{
  roomListCap: number;
  allRoomIds: ReadonlyArray<string>;
  generalDirect: ReadonlyArray<{
    roomId: string;
    chatDomain: string | null;
    domainIdentityKey: string | null;
    title: string;
    avatar: string | null;
    preview: string;
    lastMessageAt: string | null;
    unread: number;
    orderId?: string | null;
  }>;
  group: ReadonlyArray<{
    roomId: string;
    chatDomain: string | null;
    domainIdentityKey: string | null;
    title: string;
    avatar: string | null;
    preview: string;
    lastMessageAt: string | null;
    unread: number;
    orderId?: string | null;
  }>;
  trade: ReadonlyArray<{
    roomId: string;
    chatDomain: string | null;
    domainIdentityKey: string | null;
    title: string;
    avatar: string | null;
    preview: string;
    lastMessageAt: string | null;
    unread: number;
    orderId?: string | null;
  }>;
  storeOrder: ReadonlyArray<{
    roomId: string;
    chatDomain: string | null;
    domainIdentityKey: string | null;
    title: string;
    avatar: string | null;
    preview: string;
    lastMessageAt: string | null;
    unread: number;
    orderId?: string | null;
  }>;
  tradeHub: {
    roomCount: number;
    unreadMetric: number;
    unreadUnit: "message_sum" | "unread_room_count";
    latestRoomId: string | null;
    latestActivityAt: string | null;
    preview: string;
    href: string;
  };
  storeOrderHub: {
    roomCount: number;
    unreadMetric: number;
    unreadUnit: "message_sum" | "unread_room_count";
    latestRoomId: string | null;
    latestActivityAt: string | null;
    preview: string;
    href: string;
  };
}>;

export function scheduleDomainBootstrapShadowFromLegacyHome(input: {
  viewerUserId: string;
  legacy: DomainBootstrapShadowBridgeLegacy;
}): void {
  void import("@/lib/messenger/contracts/domain-bootstrap-shadow-observe")
    .then((m) => {
      m.scheduleDomainBootstrapShadowObserve({
        viewerUserId: input.viewerUserId,
        legacy: input.legacy,
      });
    })
    .catch(() => {
      /* product path isolated */
    });
}

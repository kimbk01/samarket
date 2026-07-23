/**
 * Phase 6 trade Bootstrap API service + Persistent CachePort + Hub.
 */
import {
  buildDomainBootstrapApiResponse,
  DomainBootstrapHttpError,
  type DomainBootstrapApiResponse,
} from "@/lib/messenger/contracts/bootstrap-api-response";
import { createDomainPersistentCachePort } from "@/lib/messenger/contracts/persistent-cache-port";
import type { DomainTombstone } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import { assertTradeViewerPermission } from "@/lib/messenger/trade/permission";
import { buildTradeListSnapshot } from "@/lib/messenger/trade/list";
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import { TRADE_DOMAIN, type TradeListItem, type TradeRoomInput } from "@/lib/messenger/trade/types";
import type { TradeHubViewModel } from "@/lib/messenger/trade/ux-contract";

export const tradePhase6Cache = createDomainPersistentCachePort<TradeListItem>(TRADE_DOMAIN, "chat.trade");

export type TradeBootstrapSource = Readonly<{
  loadRooms: (viewerUserId: string) => Promise<ReadonlyArray<TradeRoomInput>>;
}>;

export function createTradeFixtureBootstrapSource(
  rooms: ReadonlyArray<TradeRoomInput>
): TradeBootstrapSource {
  return { loadRooms: async () => rooms };
}

export type TradeBootstrapHub = TradeHubViewModel & {
  unreadRoomCount: number;
  latestActivityAt: string | null;
};

export async function runTradeBootstrap(input: {
  viewerUserId: string;
  generation: string;
  snapshotKind: "full" | "partial";
  source: TradeBootstrapSource;
  tombstones?: ReadonlyArray<DomainTombstone>;
}): Promise<DomainBootstrapApiResponse<TradeListItem, TradeBootstrapHub>> {
  const viewerUserId = input.viewerUserId.trim();
  if (!viewerUserId) throw new DomainBootstrapHttpError(401, "unauthorized", "viewer required");
  const rooms = await input.source.loadRooms(viewerUserId);
  const authorized: TradeRoomInput[] = [];
  for (const room of rooms) {
    if (room.chatDomain && room.chatDomain !== TRADE_DOMAIN) {
      throw new DomainBootstrapHttpError(500, "foreign_domain", `foreign row:${room.chatDomain}`);
    }
    try {
      assertTradeViewerPermission({
        viewerUserId,
        room: {
          roomId: String(room.roomId ?? ""),
          chatDomain: room.chatDomain,
          domainIdentityKey: room.domainIdentityKey,
          sellerUserId: String(room.sellerUserId ?? ""),
          counterpartyUserId: String(room.counterpartyUserId ?? ""),
          participantUserIds: [
            String(room.sellerUserId ?? ""),
            String(room.counterpartyUserId ?? ""),
          ].filter(Boolean),
        },
      });
      authorized.push(room);
    } catch {
      throw new DomainBootstrapHttpError(403, "forbidden", `room:${room.roomId}`);
    }
  }
  const listed = buildTradeListSnapshot({
    viewerUserId,
    generation: input.generation,
    rooms: authorized,
  });
  if (!listed.ok) throw new DomainBootstrapHttpError(500, listed.error, listed.error);
  const hubBase = buildTradeHubViewModel(listed.snapshot.rows);
  const hub: TradeBootstrapHub = {
    ...hubBase,
    unreadRoomCount: hubBase.unreadCount,
    latestActivityAt: hubBase.lastEventAt,
  };
  return buildDomainBootstrapApiResponse({
    domain: TRADE_DOMAIN,
    viewerUserId,
    generation: listed.snapshot.generation,
    snapshotKind: input.snapshotKind,
    rows: listed.snapshot.rows,
    tombstones: input.tombstones,
    hub,
  });
}

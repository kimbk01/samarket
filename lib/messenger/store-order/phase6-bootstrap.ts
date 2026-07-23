/**
 * Phase 6 store_order Bootstrap API service + Persistent CachePort.
 * customer / owner surfaceRole 로 cache key 분리.
 */
import {
  buildDomainBootstrapApiResponse,
  DomainBootstrapHttpError,
  type DomainBootstrapApiResponse,
} from "@/lib/messenger/contracts/bootstrap-api-response";
import { createDomainPersistentCachePort } from "@/lib/messenger/contracts/persistent-cache-port";
import type { DomainTombstone } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import { assertStoreOrderViewerPermission } from "@/lib/messenger/store-order/permission";
import { buildStoreOrderListSnapshot } from "@/lib/messenger/store-order/list";
import { buildStoreOrderHubViewModel } from "@/lib/messenger/store-order/hub";
import {
  STORE_ORDER_DOMAIN,
  type StoreOrderListItem,
  type StoreOrderRoomInput,
} from "@/lib/messenger/store-order/types";
import type { StoreOrderHubViewModel } from "@/lib/messenger/store-order/ux-contract";

export const storeOrderPhase6Cache = createDomainPersistentCachePort<StoreOrderListItem>(
  STORE_ORDER_DOMAIN,
  "chat.store_order"
);

export type StoreOrderSurfaceRole = "customer" | "owner";

export type StoreOrderBootstrapRoomSeed = StoreOrderRoomInput & {
  storeOwnerUserIds?: ReadonlyArray<string> | null;
  participantUserIds?: ReadonlyArray<string> | null;
};

export type StoreOrderBootstrapSource = Readonly<{
  loadRooms: (
    viewerUserId: string,
    role: StoreOrderSurfaceRole
  ) => Promise<ReadonlyArray<StoreOrderBootstrapRoomSeed>>;
}>;

export function createStoreOrderFixtureBootstrapSource(
  rooms: ReadonlyArray<StoreOrderBootstrapRoomSeed>
): StoreOrderBootstrapSource {
  return {
    loadRooms: async (viewerUserId, role) =>
      rooms.filter((r) => {
        const cust = String(r.customerUserId ?? "");
        const owners = r.storeOwnerUserIds ?? [];
        if (role === "customer") return cust === viewerUserId;
        return owners.includes(viewerUserId);
      }),
  };
}

export type StoreOrderBootstrapHub = StoreOrderHubViewModel & {
  unreadRoomCount: number;
  latestActivityAt: string | null;
};

export async function runStoreOrderBootstrap(input: {
  viewerUserId: string;
  generation: string;
  snapshotKind: "full" | "partial";
  surfaceRole: StoreOrderSurfaceRole;
  source: StoreOrderBootstrapSource;
  tombstones?: ReadonlyArray<DomainTombstone>;
}): Promise<DomainBootstrapApiResponse<StoreOrderListItem, StoreOrderBootstrapHub>> {
  const viewerUserId = input.viewerUserId.trim();
  if (!viewerUserId) throw new DomainBootstrapHttpError(401, "unauthorized", "viewer required");
  const rooms = await input.source.loadRooms(viewerUserId, input.surfaceRole);
  const authorized: StoreOrderRoomInput[] = [];
  for (const room of rooms) {
    if (room.chatDomain && room.chatDomain !== STORE_ORDER_DOMAIN) {
      throw new DomainBootstrapHttpError(500, "foreign_domain", `foreign row:${room.chatDomain}`);
    }
    const customerUserId = String(room.customerUserId ?? "");
    const storeOwnerUserIds = room.storeOwnerUserIds ?? [];
    if (input.surfaceRole === "customer" && customerUserId !== viewerUserId) {
      throw new DomainBootstrapHttpError(403, "forbidden", `not_buyer:${room.roomId}`);
    }
    if (input.surfaceRole === "owner" && !storeOwnerUserIds.includes(viewerUserId)) {
      throw new DomainBootstrapHttpError(403, "forbidden", `not_owner:${room.roomId}`);
    }
    try {
      assertStoreOrderViewerPermission({
        viewerUserId,
        room: {
          roomId: String(room.roomId ?? ""),
          chatDomain: room.chatDomain,
          domainIdentityKey: room.domainIdentityKey,
          orderId: String(room.orderId ?? ""),
          customerUserId,
          storeOwnerUserIds,
          participantUserIds:
            room.participantUserIds ??
            [customerUserId, ...storeOwnerUserIds].filter(Boolean),
        },
      });
      authorized.push(room);
    } catch {
      throw new DomainBootstrapHttpError(403, "forbidden", `room:${room.roomId}`);
    }
  }
  const listed = buildStoreOrderListSnapshot({
    viewerUserId,
    generation: input.generation,
    rooms: authorized,
  });
  if (!listed.ok) throw new DomainBootstrapHttpError(500, listed.error, listed.error);
  const hubBase = buildStoreOrderHubViewModel(listed.snapshot.rows);
  const hub: StoreOrderBootstrapHub = {
    ...hubBase,
    unreadRoomCount: hubBase.unreadCount,
    latestActivityAt: hubBase.lastEventAt,
  };
  return buildDomainBootstrapApiResponse({
    domain: STORE_ORDER_DOMAIN,
    viewerUserId,
    generation: listed.snapshot.generation,
    snapshotKind: input.snapshotKind,
    rows: listed.snapshot.rows,
    tombstones: input.tombstones,
    hub,
  });
}

export function buildStoreOrderCacheKeyForSurface(input: {
  viewerUserId: string;
  surfaceRole: StoreOrderSurfaceRole;
  generation?: string;
}): string {
  return storeOrderPhase6Cache.buildCacheKey({
    viewerUserId: input.viewerUserId,
    surfaceRole: input.surfaceRole,
    generation: input.generation,
  });
}

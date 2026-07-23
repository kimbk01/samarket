/**
 * Phase 8A — store_order Read/Unread/Badge architecture ports.
 * surfaceRole 필수 · customer/owner contribution 분리 · 매장 간 합산 금지.
 */
import { createDomainReadPortHarness } from "@/lib/messenger/contracts/domain-read-port-harness";
import type {
  StoreOrderUnreadContribution,
  DomainAppIconContribution,
  DomainReadRequest,
} from "@/lib/messenger/contracts/domain-read-unread-badge";
import {
  D1_2_APP_ICON_UNIT,
  D1_2_APP_ICON_UNIT_OPEN,
} from "@/lib/messenger/contracts/badge-unit-policy-phase8b";
import {
  assertStoreOrderOwnedRoom,
  parseStoreOrderIdentityKey,
} from "@/lib/messenger/store-order/identity";
import { assertStoreOrderViewerPermission } from "@/lib/messenger/store-order/permission";
import { STORE_ORDER_DOMAIN, type StoreOrderListItem } from "@/lib/messenger/store-order/types";
import type { StoreOrderSurfaceRole } from "@/lib/messenger/store-order/phase6-bootstrap";
import {
  buildStoreOrderBadgeContribution,
  countStoreOrderUnreadRooms,
} from "@/lib/messenger/store-order/read-unread-badge";

export function createStoreOrderReadPort(input: {
  surfaceRole: StoreOrderSurfaceRole;
  storeId?: string | null;
  ownerUserIds?: ReadonlyArray<string>;
  customerUserId?: string | null;
}) {
  return createDomainReadPortHarness({
    domain: STORE_ORDER_DOMAIN,
    assertIdentity: (req: DomainReadRequest) => {
      assertStoreOrderOwnedRoom({
        roomId: req.roomId,
        chatDomain: req.chatDomain as "store_order",
        domainIdentityKey: req.domainIdentityKey,
      });
    },
    assertPermission: (req: DomainReadRequest) => {
      const { orderId } = parseStoreOrderIdentityKey(req.domainIdentityKey);
      const customer =
        input.customerUserId ??
        (input.surfaceRole === "customer" ? req.viewerUserId : "cust-unknown");
      const owners =
        input.ownerUserIds ??
        (input.surfaceRole === "owner" ? [req.viewerUserId] : ["owner-unknown"]);
      assertStoreOrderViewerPermission({
        viewerUserId: req.viewerUserId,
        room: {
          roomId: req.roomId,
          chatDomain: req.chatDomain,
          domainIdentityKey: req.domainIdentityKey,
          orderId,
          customerUserId: customer,
          storeOwnerUserIds: owners,
          participantUserIds: [customer, ...owners],
        },
      });
    },
  });
}

export type StoreOrderReadPort = ReturnType<typeof createStoreOrderReadPort>;

export function buildStoreOrderUnreadContribution(input: {
  viewerUserId: string;
  surfaceRole: StoreOrderSurfaceRole;
  storeId: string | null;
  rows: ReadonlyArray<StoreOrderListItem>;
  generation: number;
}): StoreOrderUnreadContribution {
  for (const r of input.rows) {
    if (r.chatDomain !== STORE_ORDER_DOMAIN) {
      throw new Error("dibay_store_order_unread_foreign_row");
    }
    if (input.storeId && r.storeId && r.storeId !== input.storeId) {
      throw new Error("dibay_store_order_unread_foreign_store");
    }
  }
  let messageCount = 0;
  for (const r of input.rows) messageCount += Math.max(0, r.unreadCount);
  return {
    domain: STORE_ORDER_DOMAIN,
    viewerUserId: input.viewerUserId,
    unreadMessageCount: messageCount,
    unreadRoomCount: countStoreOrderUnreadRooms(input.rows),
    unreadIdentityKeys: input.rows.filter((r) => r.unreadCount > 0).map((r) => r.domainIdentityKey),
    unreadOrderIdentityKeys: input.rows
      .filter((r) => r.unreadCount > 0)
      .map((r) => r.domainIdentityKey),
    latestUnreadGeneration: input.generation,
    generation: input.generation,
    sourceAuthority: "server_snapshot",
    computedAt: new Date().toISOString(),
    surfaceRole: input.surfaceRole,
    storeId: input.storeId,
  };
}

/** 다른 store owner contribution 합산 금지 */
export function assertSameStoreOwnerContributions(
  contributions: ReadonlyArray<StoreOrderUnreadContribution>
): void {
  const storeIds = new Set(
    contributions.map((c) => c.storeId).filter((s): s is string => Boolean(s))
  );
  if (storeIds.size > 1) {
    throw new Error("dibay_store_order_owner_cross_store_aggregate_forbidden");
  }
  for (const c of contributions) {
    if (c.surfaceRole !== "owner") {
      throw new Error("dibay_store_order_owner_contribution_required");
    }
  }
}

export function buildStoreOrderHubBadgeFromUnread(unread: StoreOrderUnreadContribution): number {
  if (unread.domain !== STORE_ORDER_DOMAIN) throw new Error("dibay_store_order_hub_badge_foreign");
  return unread.unreadRoomCount;
}

export function buildStoreOrderAppIconContribution(
  unread: StoreOrderUnreadContribution,
  notificationEventCount = 0
): DomainAppIconContribution {
  return {
    domain: STORE_ORDER_DOMAIN,
    viewerUserId: unread.viewerUserId,
    unreadMessageCount: unread.unreadMessageCount,
    unreadRoomCount: unread.unreadRoomCount,
    notificationEventCount,
    generation: unread.generation,
    d1_2UnitSelection: D1_2_APP_ICON_UNIT,
    d1_2Open: D1_2_APP_ICON_UNIT_OPEN,
  };
}

export function buildStoreOrderRowBadge(row: StoreOrderListItem): number {
  if (row.chatDomain !== STORE_ORDER_DOMAIN) throw new Error("dibay_store_order_row_badge_foreign");
  return Math.max(0, row.unreadCount);
}

export { buildStoreOrderBadgeContribution };

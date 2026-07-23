/**
 * Phase 11A — store_order Customer DB Loader (완전 분리).
 * 상대 = store. owner 회원명/avatar 반환 금지.
 */
import {
  assertNoDuplicateDomainIdentity,
  pickAuthoritativeMessagePreview,
  type DomainLoaderLatestMessageRow,
} from "@/lib/messenger/contracts/domain-loader-batch-phase11a";
import type { StoreOrderBootstrapSource } from "@/lib/messenger/store-order/phase6-bootstrap";
import { buildStoreOrderIdentityKey } from "@/lib/messenger/store-order/design-lock";
import {
  STORE_ORDER_DOMAIN,
  type StoreOrderRoomInput,
} from "@/lib/messenger/store-order/types";

export type StoreOrderCustomerLoaderBatchRow = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  orderId: string;
  storeId: string;
  storeName: string | null;
  storeImageUrl: string | null;
  customerUserId: string;
  unreadCount: number;
  latestMessage: DomainLoaderLatestMessageRow | null;
  orderStatusLabel?: string | null;
  fulfillmentType?: string | null;
  roomLastMessageSummary?: string | null;
  /** forbidden on customer surface */
  ownerMemberName?: string | null;
  ownerMemberAvatarUrl?: string | null;
}>;

export function mapStoreOrderCustomerLoaderBatchRows(input: {
  viewerUserId: string;
  rows: ReadonlyArray<StoreOrderCustomerLoaderBatchRow>;
  failClosedOnUnauthorized?: boolean;
}): ReadonlyArray<StoreOrderRoomInput & { storeOwnerUserIds?: string[] }> {
  const viewer = input.viewerUserId.trim();
  const out: Array<StoreOrderRoomInput & { storeOwnerUserIds?: string[] }> = [];
  for (const row of input.rows) {
    if (row.chatDomain !== STORE_ORDER_DOMAIN) {
      throw new Error(`dibay_so_customer_loader_foreign_domain:${row.chatDomain}`);
    }
    const expected = buildStoreOrderIdentityKey(row.orderId);
    if (row.domainIdentityKey !== expected) {
      throw new Error("dibay_so_customer_loader_identity_mismatch");
    }
    if (row.customerUserId !== viewer) {
      if (input.failClosedOnUnauthorized) {
        throw new Error(`dibay_so_customer_loader_forbidden:${row.orderId}`);
      }
      continue;
    }
    if (row.ownerMemberName?.trim() || row.ownerMemberAvatarUrl?.trim()) {
      throw new Error("dibay_so_customer_loader_owner_member_forbidden");
    }
    out.push({
      roomId: row.roomId,
      chatDomain: STORE_ORDER_DOMAIN,
      domainIdentityKey: row.domainIdentityKey,
      orderId: row.orderId,
      storeId: row.storeId,
      storeName: row.storeName,
      storeImageUrl: row.storeImageUrl,
      customerUserId: row.customerUserId,
      customerName: null,
      customerAvatarUrl: null,
      latestChatMessageText: pickAuthoritativeMessagePreview({
        latestMessage: row.latestMessage,
        roomLastMessageSummary: row.roomLastMessageSummary,
        orderStatusLabel: row.orderStatusLabel,
      }),
      latestChatMessageAt: row.latestMessage?.createdAt ?? null,
      unreadCount: row.unreadCount,
      orderStatusLabel: row.orderStatusLabel ?? null,
      fulfillmentType: row.fulfillmentType ?? null,
      // customer surface must not carry owner ids for presentation
      storeOwnerUserIds: [],
    });
  }
  assertNoDuplicateDomainIdentity(
    out.map((r) => ({
      domainIdentityKey: String(r.domainIdentityKey),
      roomId: String(r.roomId),
    })),
    STORE_ORDER_DOMAIN
  );
  return out;
}

export function createStoreOrderCustomerDbLoaderSource(
  loadBatch: (viewerUserId: string) => Promise<ReadonlyArray<StoreOrderCustomerLoaderBatchRow>>
): StoreOrderBootstrapSource {
  return {
    loadRooms: async (viewerUserId, role) => {
      if (role !== "customer") {
        throw new Error("dibay_so_customer_loader_role_mismatch");
      }
      return mapStoreOrderCustomerLoaderBatchRows({
        viewerUserId,
        rows: await loadBatch(viewerUserId),
        failClosedOnUnauthorized: true,
      });
    },
  };
}

export function createStoreOrderCustomerInMemoryLoaderSource(
  seed: ReadonlyArray<StoreOrderCustomerLoaderBatchRow>
): StoreOrderBootstrapSource {
  return createStoreOrderCustomerDbLoaderSource(async (viewerUserId) =>
    seed.filter(
      (r) => r.chatDomain === STORE_ORDER_DOMAIN && r.customerUserId === viewerUserId
    )
  );
}

export const STORE_ORDER_CUSTOMER_LOADER_SQL_PLAN = {
  q1: `store_orders buyer_user_id=$viewer + rooms chat_domain=store_order`,
  q2: `latest order-chat messages ANY(room_ids)`,
  q3: `stores name/image batch — never owner profile`,
  q4: `notification_targets buyer_order is_unread (list/hub badge SSOT)`,
  nPlusOne: false,
} as const;

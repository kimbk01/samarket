/**
 * Phase 11A — store_order Owner DB Loader (완전 분리).
 * 상대 = 해당 주문 customer. customer Surface 혼용 금지.
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

export type StoreOrderOwnerLoaderBatchRow = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  orderId: string;
  storeId: string;
  customerUserId: string;
  customerName: string | null;
  customerAvatarUrl: string | null;
  unreadCount: number;
  storeOwnerUserIds: ReadonlyArray<string>;
  latestMessage: DomainLoaderLatestMessageRow | null;
  orderStatusLabel?: string | null;
  fulfillmentType?: string | null;
  roomLastMessageSummary?: string | null;
  /** forbidden as owner title */
  storeName?: string | null;
  storeImageUrl?: string | null;
}>;

export function mapStoreOrderOwnerLoaderBatchRows(input: {
  viewerUserId: string;
  storeIdFilter?: string | null;
  rows: ReadonlyArray<StoreOrderOwnerLoaderBatchRow>;
  failClosedOnUnauthorized?: boolean;
}): ReadonlyArray<StoreOrderRoomInput & { storeOwnerUserIds: string[] }> {
  const viewer = input.viewerUserId.trim();
  const out: Array<StoreOrderRoomInput & { storeOwnerUserIds: string[] }> = [];
  for (const row of input.rows) {
    if (row.chatDomain !== STORE_ORDER_DOMAIN) {
      throw new Error(`dibay_so_owner_loader_foreign_domain:${row.chatDomain}`);
    }
    const expected = buildStoreOrderIdentityKey(row.orderId);
    if (row.domainIdentityKey !== expected) {
      throw new Error("dibay_so_owner_loader_identity_mismatch");
    }
    if (!row.storeOwnerUserIds.includes(viewer)) {
      if (input.failClosedOnUnauthorized) {
        throw new Error(`dibay_so_owner_loader_forbidden:${row.orderId}`);
      }
      continue;
    }
    if (input.storeIdFilter && row.storeId !== input.storeIdFilter) {
      if (input.failClosedOnUnauthorized) {
        throw new Error(`dibay_so_owner_loader_store_forbidden:${row.storeId}`);
      }
      continue;
    }
    // store presentation fields unused on owner surface rows
    void row.storeName;
    void row.storeImageUrl;
    out.push({
      roomId: row.roomId,
      chatDomain: STORE_ORDER_DOMAIN,
      domainIdentityKey: row.domainIdentityKey,
      orderId: row.orderId,
      storeId: row.storeId,
      storeName: null,
      storeImageUrl: null,
      customerUserId: row.customerUserId,
      customerName: row.customerName,
      customerAvatarUrl: row.customerAvatarUrl,
      latestChatMessageText: pickAuthoritativeMessagePreview({
        latestMessage: row.latestMessage,
        roomLastMessageSummary: row.roomLastMessageSummary,
        orderStatusLabel: row.orderStatusLabel,
      }),
      latestChatMessageAt: row.latestMessage?.createdAt ?? null,
      unreadCount: row.unreadCount,
      orderStatusLabel: row.orderStatusLabel ?? null,
      fulfillmentType: row.fulfillmentType ?? null,
      storeOwnerUserIds: [...row.storeOwnerUserIds],
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

export function createStoreOrderOwnerDbLoaderSource(
  loadBatch: (viewerUserId: string) => Promise<ReadonlyArray<StoreOrderOwnerLoaderBatchRow>>,
  opts?: { storeIdFilter?: string | null }
): StoreOrderBootstrapSource {
  return {
    loadRooms: async (viewerUserId, role) => {
      if (role !== "owner") {
        throw new Error("dibay_so_owner_loader_role_mismatch");
      }
      return mapStoreOrderOwnerLoaderBatchRows({
        viewerUserId,
        storeIdFilter: opts?.storeIdFilter,
        rows: await loadBatch(viewerUserId),
        failClosedOnUnauthorized: true,
      });
    },
  };
}

export function createStoreOrderOwnerInMemoryLoaderSource(
  seed: ReadonlyArray<StoreOrderOwnerLoaderBatchRow>,
  opts?: { storeIdFilter?: string | null }
): StoreOrderBootstrapSource {
  return createStoreOrderOwnerDbLoaderSource(
    async (viewerUserId) =>
      seed.filter(
        (r) =>
          r.chatDomain === STORE_ORDER_DOMAIN && r.storeOwnerUserIds.includes(viewerUserId)
      ),
    opts
  );
}

export const STORE_ORDER_OWNER_LOADER_SQL_PLAN = {
  q1: `store_orders for stores owned by viewer (+ optional storeId) · chat_domain=store_order`,
  q2: `latest order-chat messages ANY(room_ids)`,
  q3: `customer profiles batch — never use customer loader output`,
  q4: `notification_targets owner_order_chat is_unread (target_id=room_id; list/hub badge SSOT)`,
  nPlusOne: false,
} as const;

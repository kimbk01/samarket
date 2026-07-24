/**
 * Phase 11A — trade DB Loader (batch).
 * 사용자 pair dedupe / product_chat+canonical 동시 반환 / summary→preview 금지.
 */
import {
  assertNoDuplicateDomainIdentity,
  pickAuthoritativeMessagePreview,
  type DomainLoaderLatestMessageRow,
} from "@/lib/messenger/contracts/domain-loader-batch-phase11a";
import type { TradeBootstrapSource } from "@/lib/messenger/trade/phase6-bootstrap";
import { parseTradeIdentityKey } from "@/lib/messenger/trade/identity";
import { TRADE_DOMAIN, type TradeRoomInput } from "@/lib/messenger/trade/types";

function trimOrEmpty(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export type TradeLoaderBatchRow = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  itemId: string;
  sellerUserId: string;
  counterpartyUserId: string;
  itemTitle: string | null;
  itemImageUrl: string | null;
  peerDisplayName: string | null;
  peerAvatarUrl: string | null;
  /** Real `product_chats.id` for TradeProcess dock — never posts.id */
  productChatId?: string | null;
  unreadCount: number;
  latestMessage: DomainLoaderLatestMessageRow | null;
  roomLastMessageSummary?: string | null;
  productSummary?: string | null;
  tradeStatusLabel?: string | null;
  /** legacy duplicate marker — if true and canonical also present → reject */
  isLegacyProductChatDuplicate?: boolean;
}>;

export function mapTradeLoaderBatchRows(input: {
  viewerUserId: string;
  rows: ReadonlyArray<TradeLoaderBatchRow>;
  failClosedOnUnauthorized?: boolean;
}): ReadonlyArray<TradeRoomInput> {
  const viewer = input.viewerUserId.trim();
  const out: TradeRoomInput[] = [];
  const legacyRooms: string[] = [];
  const canonicalByIdentity = new Set<string>();

  for (const row of input.rows) {
    if (row.chatDomain !== TRADE_DOMAIN) {
      throw new Error(`dibay_trade_loader_foreign_domain:${row.chatDomain}`);
    }
    let parsed: { itemId: string; sellerUserId: string; counterpartyUserId: string };
    try {
      parsed = parseTradeIdentityKey(row.domainIdentityKey);
    } catch {
      throw new Error("dibay_trade_loader_identity_invalid");
    }
    if (
      parsed.itemId !== row.itemId ||
      parsed.sellerUserId !== row.sellerUserId ||
      parsed.counterpartyUserId !== row.counterpartyUserId
    ) {
      throw new Error("dibay_trade_loader_identity_field_mismatch");
    }
    if (viewer !== row.sellerUserId && viewer !== row.counterpartyUserId) {
      if (input.failClosedOnUnauthorized) {
        throw new Error(`dibay_trade_loader_forbidden:${row.roomId}`);
      }
      continue;
    }
    if (row.isLegacyProductChatDuplicate) {
      legacyRooms.push(row.roomId);
    } else {
      canonicalByIdentity.add(row.domainIdentityKey);
    }
    out.push({
      roomId: row.roomId,
      chatDomain: TRADE_DOMAIN,
      domainIdentityKey: row.domainIdentityKey,
      itemId: row.itemId,
      sellerUserId: row.sellerUserId,
      counterpartyUserId: row.counterpartyUserId,
      itemTitle: row.itemTitle,
      itemImageUrl: row.itemImageUrl,
      peerDisplayName: row.peerDisplayName,
      peerAvatarUrl: row.peerAvatarUrl,
      productChatId: row.productChatId?.trim() || null,
      lastMessage: pickAuthoritativeMessagePreview({
        latestMessage: row.latestMessage,
        roomLastMessageSummary: row.roomLastMessageSummary,
        productSummary: row.productSummary,
        orderStatusLabel: null,
      }),
      lastMessageAt: row.latestMessage?.createdAt ?? null,
      lastMessageIsSystem: row.latestMessage?.isSystem === true,
      unreadCount: row.unreadCount,
      tradeStatusLabel: trimOrEmpty(row.tradeStatusLabel) || null,
    });
  }

  // legacy + canonical same identity together → contract error
  for (const row of input.rows) {
    if (
      row.isLegacyProductChatDuplicate &&
      canonicalByIdentity.has(row.domainIdentityKey)
    ) {
      throw new Error(`dibay_trade_loader_legacy_canonical_both:${row.domainIdentityKey}`);
    }
  }

  assertNoDuplicateDomainIdentity(
    out.map((r) => ({
      domainIdentityKey: String(r.domainIdentityKey),
      roomId: String(r.roomId),
    })),
    TRADE_DOMAIN
  );
  return out;
}

export function createTradeDbLoaderSource(
  loadBatch: (viewerUserId: string) => Promise<ReadonlyArray<TradeLoaderBatchRow>>
): TradeBootstrapSource {
  return {
    loadRooms: async (viewerUserId) =>
      mapTradeLoaderBatchRows({
        viewerUserId,
        rows: await loadBatch(viewerUserId),
        failClosedOnUnauthorized: true,
      }),
  };
}

export function createTradeInMemoryLoaderSource(
  seed: ReadonlyArray<TradeLoaderBatchRow>
): TradeBootstrapSource {
  return createTradeDbLoaderSource(async (viewerUserId) =>
    seed.filter(
      (r) =>
        r.chatDomain === TRADE_DOMAIN &&
        (r.sellerUserId === viewerUserId || r.counterpartyUserId === viewerUserId)
    )
  );
}

export const TRADE_LOADER_SQL_PLAN = {
  q1: `rooms chat_domain=trade AND viewer in (seller,counterparty) via identity/participants`,
  q2: `latest chat messages ANY(room_ids) — not product summary`,
  q3: `items + peer profiles batch`,
  forbid: "pair dedupe · legacy+canonical dual return · N+1",
  nPlusOne: false,
} as const;

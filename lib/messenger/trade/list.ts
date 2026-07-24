/**
 * trade ListPort — trade 방만 · 방 단위 1행. user-pair 병합 금지.
 */
import { buildTradeIdentity, parseTradeIdentityKey } from "@/lib/messenger/trade/identity";
import { resolveTradeViewerRole } from "@/lib/messenger/trade/viewer-role";
import {
  TRADE_DOMAIN,
  TRADE_PEER_PLACEHOLDER,
  TRADE_PRODUCT_TITLE_PLACEHOLDER,
  type TradeListItem,
  type TradeListSnapshot,
  type TradeRoomInput,
} from "@/lib/messenger/trade/types";

export type TradeListPortResult =
  | { ok: true; snapshot: TradeListSnapshot }
  | { ok: false; error: string };

function trimOrEmpty(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

function rejectForeignOrInvalid(row: TradeRoomInput): string | null {
  const domain = trimOrEmpty(row.chatDomain);
  const identityKey = trimOrEmpty(row.domainIdentityKey);
  if (!domain) return "dibay_trade_domain_missing";
  if (domain === "general_direct" || domain === "group" || domain === "store_order") {
    return `dibay_trade_rejects_${domain}`;
  }
  if (domain !== TRADE_DOMAIN) return "dibay_trade_domain_mismatch";
  if (!identityKey) return "dibay_trade_identity_missing";
  try {
    parseTradeIdentityKey(identityKey);
  } catch (e) {
    return e instanceof Error ? e.message : "dibay_trade_identity_invalid";
  }
  if (!trimOrEmpty(row.roomId)) return "dibay_trade_room_id_required";
  if (!trimOrEmpty(row.itemId)) return "dibay_trade_item_id_required";
  if (!trimOrEmpty(row.sellerUserId) || !trimOrEmpty(row.counterpartyUserId)) {
    return "dibay_trade_parties_required";
  }
  const expected = buildTradeIdentity({
    itemId: trimOrEmpty(row.itemId),
    sellerUserId: trimOrEmpty(row.sellerUserId),
    counterpartyUserId: trimOrEmpty(row.counterpartyUserId),
  }).identityKey;
  if (identityKey !== expected) return "dibay_trade_identity_parts_mismatch";
  return null;
}

export function mapTradeListItem(
  row: TradeRoomInput,
  generation: string,
  viewerUserId: string
): TradeListItem | null {
  const err = rejectForeignOrInvalid(row);
  if (err) throw new Error(err);
  const sellerUserId = trimOrEmpty(row.sellerUserId);
  const counterpartyUserId = trimOrEmpty(row.counterpartyUserId);
  const viewerRole = resolveTradeViewerRole({
    viewerUserId,
    sellerUserId,
    counterpartyUserId,
  });
  if (!viewerRole) {
    console.warn("[TRADE_PARTICIPANT_MISMATCH]", {
      roomId: trimOrEmpty(row.roomId),
      viewerUserId: viewerUserId.trim(),
      sellerUserId,
      counterpartyUserId,
    });
    return null;
  }
  const lastAt = trimOrEmpty(row.lastMessageAt) || trimOrEmpty(row.updatedAt) || "";
  return {
    roomId: trimOrEmpty(row.roomId),
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: trimOrEmpty(row.domainIdentityKey),
    itemId: trimOrEmpty(row.itemId),
    sellerUserId,
    counterpartyUserId,
    viewerRole,
    itemTitle: trimOrEmpty(row.itemTitle) || TRADE_PRODUCT_TITLE_PLACEHOLDER,
    itemImageUrl: trimOrEmpty(row.itemImageUrl) || null,
    peerDisplayName: trimOrEmpty(row.peerDisplayName) || TRADE_PEER_PLACEHOLDER,
    peerAvatarUrl: trimOrEmpty(row.peerAvatarUrl) || null,
    productChatId: trimOrEmpty(row.productChatId) || null,
    lastMessage: trimOrEmpty(row.lastMessage),
    lastMessageIsSystem: row.lastMessageIsSystem === true,
    lastMessageAt: lastAt,
    unreadCount: Math.max(0, Math.floor(Number(row.unreadCount) || 0)),
    tradeStatusLabel: trimOrEmpty(row.tradeStatusLabel) || null,
    updatedAt: trimOrEmpty(row.updatedAt) || lastAt,
    generation,
  };
}

export function buildTradeListSnapshot(input: {
  viewerUserId: string;
  generation: string;
  rooms: ReadonlyArray<TradeRoomInput>;
}): TradeListPortResult {
  const viewerUserId = input.viewerUserId.trim();
  if (!viewerUserId) return { ok: false, error: "dibay_trade_viewer_required" };
  const generation = input.generation.trim() || "0";
  const seenIdentity = new Map<string, string>();
  const rows: TradeListItem[] = [];

  for (const room of input.rooms) {
    const foreign = rejectForeignOrInvalid(room);
    if (foreign) return { ok: false, error: foreign };
    let item: TradeListItem | null;
    try {
      item = mapTradeListItem(room, generation, viewerUserId);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "dibay_trade_list_map_failed" };
    }
    if (!item) continue;
    const prev = seenIdentity.get(item.domainIdentityKey);
    if (prev && prev !== item.roomId) {
      return { ok: false, error: `dibay_trade_duplicate_identity:${item.domainIdentityKey}` };
    }
    seenIdentity.set(item.domainIdentityKey, item.roomId);
    rows.push(item);
  }

  return {
    ok: true,
    snapshot: { domain: TRADE_DOMAIN, viewerUserId, generation, rows },
  };
}

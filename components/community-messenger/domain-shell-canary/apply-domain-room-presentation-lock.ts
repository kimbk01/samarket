import type { DomainRoomPresentation } from "@/components/community-messenger/domain-shell-canary/DomainRoomReadCanaryContext";
import type {
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { isMessengerCommerceDirectKey } from "@/lib/community-messenger/messenger-room-domain";

const STORE_ORDER_IDENTITY_PREFIX = "store_order:";
const TRADE_IDENTITY_RE = /^trade:([^:]+):([^:]+):([^:]+)$/;

/**
 * Parse `store_order:{orderId}` from Domain identity key.
 * Does not fall back to direct_key / summary reinference.
 */
export function parseDomainOrderIdFromIdentityKey(key: string): string | null {
  const k = key.trim();
  if (!k.startsWith(STORE_ORDER_IDENTITY_PREFIX)) return null;
  const orderId = k.slice(STORE_ORDER_IDENTITY_PREFIX.length).trim();
  return orderId.length > 0 ? orderId : null;
}

/** True when Domain room presentation owns Read for this roomId (Canary). */
export function isDomainRoomReadAuthority(
  presentation: DomainRoomPresentation | null,
  roomId: string
): boolean {
  if (!presentation) return false;
  return presentation.roomId.trim() === roomId.trim();
}

/**
 * Build delivery contextMeta from Domain presentation only (no direct_key reinference).
 */
export function buildDeliveryContextMetaFromDomainPresentation(
  presentation: DomainRoomPresentation
): CommunityMessengerRoomContextMetaV1 | null {
  if (presentation.chatDomain !== "store_order") return null;
  const storeOrderId = parseDomainOrderIdFromIdentityKey(presentation.domainIdentityKey);
  if (!storeOrderId) return null;
  const storeName =
    presentation.header.kind === "buyer_store" ? presentation.header.title.trim() : "";
  return {
    v: 1,
    kind: "delivery",
    storeOrderId,
    ...(storeName ? { storeDisplayName: storeName, headline: storeName } : {}),
  };
}

function tryParseTradePartsFromIdentity(key: string): {
  itemId: string;
  sellerId: string;
  buyerId: string;
} | null {
  const m = TRADE_IDENTITY_RE.exec(key.trim());
  if (!m) return null;
  const itemId = m[1]!.trim();
  const sellerId = m[2]!.trim();
  const buyerId = m[3]!.trim();
  if (!itemId || !sellerId || !buyerId || sellerId === buyerId) return null;
  return { itemId, sellerId, buyerId };
}

function lockTradeContextMeta(
  existing: CommunityMessengerRoomContextMetaV1 | null | undefined,
  domainIdentityKey: string,
  product?: {
    title: string;
    imageUrl: string | null;
    itemId: string | null;
    productChatId: string | null;
  }
): CommunityMessengerRoomContextMetaV1 {
  const parts = tryParseTradePartsFromIdentity(domainIdentityKey);
  const itemId = product?.itemId?.trim() || parts?.itemId || "";
  const headline = product?.title?.trim() || existing?.headline?.trim() || "";
  const thumbnailUrl =
    product?.imageUrl?.trim() ||
    (typeof existing?.thumbnailUrl === "string" ? existing.thumbnailUrl.trim() : "") ||
    null;

  // productChatId must be product_chats.id — never collapse to posts.id (itemId).
  const fromProduct = product?.productChatId?.trim() || "";
  const fromExisting =
    typeof existing?.productChatId === "string" ? existing.productChatId.trim() : "";
  const productChatId =
    fromProduct ||
    (fromExisting && fromExisting !== itemId ? fromExisting : "") ||
    "";

  if (existing?.kind === "trade") {
    const next: CommunityMessengerRoomContextMetaV1 = {
      ...existing,
      kind: "trade",
      v: 1,
      ...(headline ? { headline } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(itemId ? { postId: existing.postId?.trim() || itemId } : {}),
      ...(parts
        ? {
            sellerId: existing.sellerId ?? parts.sellerId,
            buyerId: existing.buyerId ?? parts.buyerId,
          }
        : {}),
    };
    if (productChatId) {
      next.productChatId = productChatId;
    } else if (fromExisting && fromExisting === itemId) {
      delete next.productChatId;
    }
    return next;
  }
  const base: CommunityMessengerRoomContextMetaV1 = { v: 1, kind: "trade" };
  if (!parts && !itemId) return base;
  return {
    ...base,
    ...(itemId ? { postId: itemId } : {}),
    ...(productChatId ? { productChatId } : {}),
    ...(parts
      ? {
          postId: parts.itemId,
          sellerId: parts.sellerId,
          buyerId: parts.buyerId,
        }
      : {}),
    ...(headline ? { headline } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

function lockStoreOrderContextMeta(
  presentation: DomainRoomPresentation,
  existing: CommunityMessengerRoomContextMetaV1 | null | undefined
): CommunityMessengerRoomContextMetaV1 {
  const fromPresentation = buildDeliveryContextMetaFromDomainPresentation(presentation);
  if (!fromPresentation) {
    return { v: 1, kind: "delivery" };
  }
  if (existing?.kind === "delivery") {
    return {
      ...existing,
      ...fromPresentation,
      storeOrderId: fromPresentation.storeOrderId,
      storeDisplayName: fromPresentation.storeDisplayName ?? existing.storeDisplayName,
      headline: fromPresentation.headline ?? existing.headline,
    };
  }
  return fromPresentation;
}

/**
 * Overwrite Legacy bootstrap room fields with Domain presentation Read Authority.
 * Keeps snapshot.messages / timeline payload from Legacy fetch.
 */
export function applyDomainRoomPresentationLock(
  snapshot: CommunityMessengerRoomSnapshot,
  presentation: DomainRoomPresentation
): CommunityMessengerRoomSnapshot {
  const snapRoomId = snapshot.room.id.trim();
  const presentationRoomId = presentation.roomId.trim();
  if (snapRoomId !== presentationRoomId) {
    throw new Error(
      `dibay_domain_room_presentation_room_id_mismatch:${snapRoomId}:${presentationRoomId}`
    );
  }

  const header = presentation.header;
  const chatDomain = presentation.chatDomain;
  const domainIdentityKey = presentation.domainIdentityKey;

  let contextMeta: CommunityMessengerRoomContextMetaV1 | null =
    snapshot.room.contextMeta ?? null;

  if (chatDomain === "general_direct" || chatDomain === "group") {
    // Prevent Phase2 chrome flip via leftover trade/delivery contextMeta
    contextMeta = null;
  } else if (chatDomain === "trade") {
    const product =
      header.kind === "trade"
        ? {
            title: header.productTitle,
            imageUrl: header.productImageUrl,
            itemId: header.itemId,
            productChatId: header.productChatId,
          }
        : undefined;
    contextMeta = lockTradeContextMeta(contextMeta, domainIdentityKey, product);
  } else if (chatDomain === "store_order") {
    contextMeta = lockStoreOrderContextMeta(presentation, contextMeta);
  }

  // Room type must follow Domain — never leave Group as Legacy `direct` 1:1 shell.
  let roomType = snapshot.room.roomType;
  if (chatDomain === "group") {
    if (roomType === "direct" || !roomType) {
      roomType = "private_group";
    }
  } else if (
    chatDomain === "general_direct" ||
    chatDomain === "trade" ||
    chatDomain === "store_order"
  ) {
    roomType = "direct";
  }

  let memberCount = snapshot.room.memberCount;
  if (header.kind === "group" && typeof header.memberCount === "number" && header.memberCount > 0) {
    memberCount = header.memberCount;
  }

  // Strip commerce direct_key remnants on inbox Domain rooms (no Legacy trade/SO reinference).
  let messengerDirectKey = snapshot.room.messengerDirectKey ?? null;
  if (
    (chatDomain === "general_direct" || chatDomain === "group") &&
    isMessengerCommerceDirectKey(messengerDirectKey)
  ) {
    messengerDirectKey = null;
  }

  return {
    ...snapshot,
    room: {
      ...snapshot.room,
      chatDomain,
      domainIdentityKey,
      roomType,
      memberCount,
      title: header.title,
      avatarUrl: header.avatarUrl,
      contextMeta,
      messengerDirectKey,
    },
  };
}

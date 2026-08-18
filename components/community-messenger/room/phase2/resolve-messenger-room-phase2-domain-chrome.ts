/**
 * Phase2 room timeline/header chrome — Domain Header Factory SSOT.
 * Uses existing runtime snapshot authority only (no new domain inference).
 *
 * Must NOT live under lib/community-messenger → @/lib/messenger (Phase 6/7/8 wiring 0).
 * Factory remains in lib/messenger/contracts/domain-room-header-chrome.ts
 */
import { isFourDomainPollutionQuarantineRoom } from "@/lib/chat-domain/four-domain-pollution-quarantine";
import {
  generalFriendDirectRoomGate,
  isMessengerCommerceDirectKey,
  messengerRoomShowsConfirmedDeliveryPresentation,
  messengerRoomShowsConfirmedTradePresentation,
} from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { resolveDomainRoomHeaderSecondaryText } from "@/components/community-messenger/domain-shell-canary/domain-room-header-chrome-client";
import {
  composeDomainRoomHeaderChrome,
  type DomainRoomHeaderChrome,
  type DomainRoomHeaderChromeInput,
} from "@/lib/messenger/contracts/domain-room-header-chrome";
import type { MessageKey } from "@/lib/i18n/messages";

export type MessengerRoomPhase2DomainChromePresentation = Readonly<{
  chrome: DomainRoomHeaderChrome;
  roomTypeLabel: string;
  /** Timeline chip — commerce domains forbid GENERAL 「· N명」 suffix. */
  showTimelineMemberCountSuffix: boolean;
  timelineMemberCount: number;
  headerPrimaryText: string | null;
  headerSecondaryText: string | null;
}>;

function tradeProductTitleFromRoom(
  room: Pick<CommunityMessengerRoomSummary, "contextMeta">,
  override?: string | null
): string | null {
  const fromOverride = override?.trim() || "";
  if (fromOverride) return fromOverride;
  const headline = room.contextMeta?.kind === "trade" ? room.contextMeta.headline?.trim() : "";
  return headline || null;
}

function resolveChromeInput(input: {
  room: CommunityMessengerRoomSummary;
  viewerUserId?: string | null;
  myRole?: "owner" | "admin" | "member";
  tradeProductTitle?: string | null;
  storeOrderId?: string | null;
  orderStatusLabel?: string | null;
}): DomainRoomHeaderChromeInput {
  const { room, viewerUserId, myRole } = input;
  const roomType = room.roomType;

  if (roomType === "open_group") {
    return {
      kind: "group",
      memberCount: Math.max(0, room.memberCount ?? 0),
      groupSubtype: "open_group",
    };
  }
  if (roomType === "private_group") {
    return {
      kind: "group",
      memberCount: Math.max(0, room.memberCount ?? 0),
      groupSubtype: "private_group",
    };
  }

  // Room UI CUT R1: commerce direct_key owns window chrome even if chatDomain is mislabeled.
  const commerceKey = room.messengerDirectKey?.trim() ?? "";
  if (isMessengerCommerceDirectKey(commerceKey)) {
    if (commerceKey.startsWith("trade_pc:") || commerceKey.startsWith("trade_item:")) {
      return {
        kind: "trade",
        peerLabel: room.title?.trim() || null,
        productTitle: tradeProductTitleFromRoom(room, input.tradeProductTitle),
      };
    }
    const orderId = input.storeOrderId?.trim() || "";
    const orderStatusLabel = input.orderStatusLabel?.trim() || null;
    if (myRole === "owner") {
      return {
        kind: "owner_buyer_peer",
        orderId: orderId || null,
        orderStatusLabel,
      };
    }
    return {
      kind: "buyer_store",
      orderId: orderId || null,
      orderStatusLabel,
    };
  }

  // R4: quarantined trade rooms keep TRADE window chrome. Do not rewrite keys or merge listings.
  if (isFourDomainPollutionQuarantineRoom(room.id)) {
    return {
      kind: "trade",
      peerLabel: room.title?.trim() || null,
      productTitle: tradeProductTitleFromRoom(room, input.tradeProductTitle),
    };
  }

  if (messengerRoomShowsConfirmedTradePresentation(room, viewerUserId)) {
    return {
      kind: "trade",
      peerLabel: room.title?.trim() || null,
      productTitle: tradeProductTitleFromRoom(room, input.tradeProductTitle),
    };
  }

  if (messengerRoomShowsConfirmedDeliveryPresentation(room, viewerUserId)) {
    const orderId = input.storeOrderId?.trim() || "";
    const orderStatusLabel = input.orderStatusLabel?.trim() || null;
    if (myRole === "owner") {
      return {
        kind: "owner_buyer_peer",
        orderId: orderId || null,
        orderStatusLabel,
      };
    }
    return {
      kind: "buyer_store",
      orderId: orderId || null,
      orderStatusLabel,
    };
  }

  if (room.chatDomain === "trade") {
    return {
      kind: "trade",
      peerLabel: room.title?.trim() || null,
      productTitle: tradeProductTitleFromRoom(room, input.tradeProductTitle),
    };
  }

  if (room.chatDomain === "store_order") {
    const orderId = input.storeOrderId?.trim() || "";
    const orderStatusLabel = input.orderStatusLabel?.trim() || null;
    if (myRole === "owner") {
      return { kind: "owner_buyer_peer", orderId: orderId || null, orderStatusLabel };
    }
    return { kind: "buyer_store", orderId: orderId || null, orderStatusLabel };
  }

  if (room.chatDomain === "general_direct" || generalFriendDirectRoomGate(room, viewerUserId)) {
    return { kind: "general_peer" };
  }

  return { kind: "general_peer" };
}

export function resolveMessengerRoomPhase2DomainChrome(input: {
  room: CommunityMessengerRoomSummary;
  viewerUserId?: string | null;
  myRole?: "owner" | "admin" | "member";
  tradeProductTitle?: string | null;
  storeOrderId?: string | null;
  orderStatusLabel?: string | null;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}): MessengerRoomPhase2DomainChromePresentation {
  const chromeInput = resolveChromeInput(input);
  const chrome = composeDomainRoomHeaderChrome(chromeInput);
  const roomTypeLabel = input.t(chrome.roomTypeLabelKey, chrome.roomTypeLabelVars);
  const headerSecondaryText = resolveDomainRoomHeaderSecondaryText(chrome.headerSecondary, input.t);
  const headerPrimaryText =
    chrome.profileKind === "listing"
      ? tradeProductTitleFromRoom(input.room, input.tradeProductTitle)
      : null;
  const memberCount = Math.max(0, Math.floor(Number(input.room.memberCount) || 0));

  const showTimelineMemberCountSuffix = chrome.showMemberCountSuffix
    ? Boolean(chrome.memberCountForSuffix && chrome.memberCountForSuffix > 0)
    : chromeInput.kind === "general_peer" && memberCount > 0;

  const timelineMemberCount =
    chrome.showMemberCountSuffix && chrome.memberCountForSuffix != null
      ? chrome.memberCountForSuffix
      : memberCount;

  return {
    chrome,
    roomTypeLabel,
    showTimelineMemberCountSuffix,
    timelineMemberCount,
    headerPrimaryText,
    headerSecondaryText,
  };
}

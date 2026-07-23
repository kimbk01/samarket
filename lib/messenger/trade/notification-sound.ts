/**
 * trade Notification display + Sound — Domain 재추론 입력 금지.
 */
import type { MessengerNotificationPort, MessengerSoundPort } from "@/lib/messenger/contracts/ports";
import { assertTradeOwnedRoom } from "@/lib/messenger/trade/identity";
import { TRADE_DOMAIN, TRADE_PEER_PLACEHOLDER, TRADE_PRODUCT_TITLE_PLACEHOLDER } from "@/lib/messenger/trade/types";

export type TradeNotificationDisplayInput = Readonly<{
  chatDomain: string;
  domainIdentityKey: string;
  roomId: string;
  eventId: string;
  productTitle: string | null | undefined;
  productImageUrl: string | null | undefined;
  peerDisplayName: string | null | undefined;
  messagePreview: string | null | undefined;
  roomType?: string | null;
  directKey?: string | null;
  pathname?: string | null;
  titleForInference?: string | null;
}>;

export function resolveTradeNotificationDisplay(input: TradeNotificationDisplayInput): {
  domain: typeof TRADE_DOMAIN;
  productTitle: string;
  peerLabel: string;
  avatarUrl: string | null;
  preview: string;
} {
  if (input.chatDomain !== TRADE_DOMAIN) {
    throw new Error(`dibay_trade_notification_rejects:${input.chatDomain}`);
  }
  if (!input.eventId.trim()) throw new Error("dibay_trade_notification_event_required");
  if (
    input.roomType != null ||
    input.directKey != null ||
    input.pathname != null ||
    input.titleForInference != null
  ) {
    throw new Error("dibay_trade_notification_reinference_forbidden");
  }
  assertTradeOwnedRoom({
    roomId: input.roomId,
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: input.domainIdentityKey,
  });
  return {
    domain: TRADE_DOMAIN,
    productTitle: input.productTitle?.trim() || TRADE_PRODUCT_TITLE_PLACEHOLDER,
    peerLabel: input.peerDisplayName?.trim() || TRADE_PEER_PLACEHOLDER,
    avatarUrl: input.productImageUrl?.trim() || null,
    preview: input.messagePreview?.trim() || "",
  };
}

/** Phase 9 — Sound SSOT (pipeline 교체 없음) */
export const TRADE_SOUND_EVENT_KEY = "trade_chat_message_received" as const;

export function resolveTradeSoundKey(): { domain: typeof TRADE_DOMAIN; eventKey: string } {
  return { domain: TRADE_DOMAIN, eventKey: TRADE_SOUND_EVENT_KEY };
}

export const tradeNotificationPort: MessengerNotificationPort = {
  domain: TRADE_DOMAIN,
  requiresStoredChatDomain: true,
};

export const tradeSoundPort: MessengerSoundPort = {
  domain: TRADE_DOMAIN,
  soundKeyContract: TRADE_SOUND_EVENT_KEY,
};

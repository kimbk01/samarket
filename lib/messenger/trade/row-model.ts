/**
 * trade RowModel + RouterPort.
 */
import { buildChatDomainRoomHref } from "@/lib/chat-domain/ports/router-port";
import type { MessengerRouterPort } from "@/lib/messenger/contracts/ports";
import {
  resolveTradeListItemLocalizedSystemPreview,
  resolveTradeListItemPreview,
} from "@/lib/messenger/trade/preview";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { resolveTradePresentationFromListItem } from "@/lib/messenger/trade/presentation";
import { normalizeTradeListPreviewLine } from "@/lib/messenger/trade/item-status";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";
import type { TradeListItem } from "@/lib/messenger/trade/types";
import type { TradeListViewModel } from "@/lib/messenger/trade/ux-contract";

export const tradeRouterPort: MessengerRouterPort = {
  domain: TRADE_DOMAIN,
  buildRoomHref: ({ roomId, identityKey, returnHref }) =>
    buildChatDomainRoomHref(TRADE_DOMAIN, {
      roomId,
      domain: TRADE_DOMAIN,
      identityKey,
      from: "trade",
      returnHref,
    }),
};

export function buildTradeListViewModel(item: TradeListItem): TradeListViewModel {
  return buildTradeListViewModelForLanguage(item, null);
}

/** 서버 조립(요청 언어) — lang 이 없으면 `buildTradeListViewModel` 과 같다 */
export function buildTradeListViewModelForLanguage(
  item: TradeListItem,
  lang: AppLanguageCode | null | undefined
): TradeListViewModel {
  const presentation = resolveTradePresentationFromListItem(item);
  /** viewer(role 기준) 통화 문구 + 실제 message_type 라벨 — hub 와 동일 resolver */
  const preview = resolveTradeListItemPreview(item, lang);
  const statusBadge = item.tradeStatusLabel;
  /**
   * 언어 SSOT B3 — 종류 코드로 그린 시스템 문장(상품 상태는 「제목 · 상태」)은 이미 보는 사람 언어라
   * 한국어 고정 「상태 변경 · 배지」로 다시 바꾸지 않는다. 메타가 없으면 지금과 같다.
   */
  const normalized = resolveTradeListItemLocalizedSystemPreview(item, lang)
    ? { text: preview.text, isSystemEvent: true }
    : normalizeTradeListPreviewLine({
        previewText: preview.text,
        isSystem: item.lastMessageIsSystem || preview.source === "allowed_system_message",
        statusBadgeLabel: statusBadge,
      });
  return {
    roomId: item.roomId,
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    itemId: item.itemId,
    sellerUserId: item.sellerUserId,
    buyerUserId: item.counterpartyUserId,
    viewerRole: item.viewerRole,
    productTitle: presentation.productTitle,
    productImageUrl: presentation.productImageUrl,
    peerLabel: presentation.peerLabel,
    peerAvatarUrl: item.peerAvatarUrl,
    previewText: normalized.text,
    previewIsSystemEvent: normalized.isSystemEvent,
    statusBadge,
    unreadCount: item.unreadCount,
    needsResponse: item.unreadCount > 0,
    lastMessageAt: item.lastMessageAt,
    href: tradeRouterPort.buildRoomHref({
      roomId: item.roomId,
      identityKey: item.domainIdentityKey,
    }),
  };
}

/** statusBadge 는 preview 와 분리 — Row 확장은 리스트 VM + optional badge */
export function tradeStatusBadgeSeparated(item: TradeListItem): string | null {
  return item.tradeStatusLabel;
}

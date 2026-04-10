"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ChatRoom } from "@/lib/types/chat";
import { formatChatTime } from "@/lib/utils/format";
import { CURRENCY_SYMBOLS } from "@/lib/exchange/form-options";
import { PostListPreviewColumn } from "@/components/post/PostListPreviewColumn";
import { trimPreviewForChatRoomRow } from "@/lib/chats/chat-list-preview-trim";
import {
  normalizeSellerListingState,
  publicListingBadge,
} from "@/lib/products/seller-listing-state";
import { APP_FEED_LIST_CARD_SHELL } from "@/lib/ui/app-feed-card";
import { tradeChatListLastMessageDisplay } from "@/lib/chats/chat-list-last-message-display";
import { ChatRoomListMenu } from "@/components/chats/ChatRoomListMenu";
import {
  prewarmChatRouteData,
  shouldWarmChatRoute,
} from "@/lib/chats/prewarm-chat-room-route";

interface ChatRoomCardProps {
  room: ChatRoom;
  /** 판매자용 당근 스타일(○○님이 [물품명]에 채팅) 표시에 사용 */
  currentUserId?: string;
  /** 나가기·삭제 후 목록 갱신 */
  onRoomMutated?: () => void;
  /** 미지정 시 `/chats/[id]` — 주문 허브 등에서 쿼리 URL 전달 */
  getRoomHref?: (roomId: string) => string;
  /** 지정 시 라우팅 대신 목록에서 방 열기(모달 등) */
  onSelectRoom?: (roomId: string) => void;
}

function exchangeSubtitleLegacy(
  product: NonNullable<ChatRoom["product"]>,
  opts: { amountInquiry: string; exchangeRateUnset: string; exchangeRateLabel: (value: string) => string }
): string {
  if (product.isExchangePost !== true) return "";
  const php =
    product.exchangePhpAmount != null
      ? `${CURRENCY_SYMBOLS.PHP} ${product.exchangePhpAmount.toLocaleString()}`
      : opts.amountInquiry;
  const rate = product.exchangeRateSubLine ? opts.exchangeRateLabel(product.exchangeRateSubLine) : opts.exchangeRateUnset;
  return `${php} · ${rate}`;
}

export function ChatRoomCard({ room, currentUserId, onRoomMutated, getRoomHref, onSelectRoom }: ChatRoomCardProps) {
  const { t } = useI18n();
  const amISeller = !!currentUserId && room.sellerId === currentUserId;
  const product = room.product;
  const productTitle = product?.title || t("nav_trade_product_fallback");
  const roleLabel = currentUserId ? (amISeller ? t("nav_trade_my_sale") : t("nav_trade_my_purchase")) : t("nav_trade_chat_label");
  const rowPreview = product?.listPreview ? trimPreviewForChatRoomRow(product.listPreview) : null;
  const isExchangeLegacy = product?.isExchangePost === true && !rowPreview;
  const isExchangeThumb =
    rowPreview?.thumbnailMode === "exchange" || (isExchangeLegacy && !!product?.isExchangePost);
  const isNewOrUnread = !room.lastMessage?.trim() || room.unreadCount > 0;
  const sellerPreview = amISeller && isNewOrUnread
    ? t("nav_trade_new_chat_on_product", { nickname: room.partnerNickname, product: productTitle })
    : null;
  const lastMessageDisplay = tradeChatListLastMessageDisplay(room);

  const listingPost = {
    seller_listing_state: product?.sellerListingState,
    status: product?.status,
    type: "trade" as const,
  };

  const authorLine =
    product?.authorNickname?.trim() || (!amISeller ? room.partnerNickname : t("nav_messenger_me"));
  const roleLine = amISeller
    ? t("nav_trade_seller_conversation", { nickname: room.partnerNickname })
    : t("nav_trade_buyer_conversation", { nickname: authorLine });
  const listingState = normalizeSellerListingState(
    room.tradeStatus ?? product?.sellerListingState,
    product?.status
  );
  const { label: tradeStatusLabel, tone: tradeTone } = publicListingBadge(
    listingState,
    product?.status
  );
  const tradeToneClass =
    tradeTone === "signature"
      ? "text-signature"
      : tradeTone === "amber"
        ? "text-amber-800"
        : tradeTone === "muted"
          ? "text-gray-400"
          : "text-gray-600";

  /** 통합 채팅(chat_rooms)만 참가자 API(나가기·숨김) 사용 — 레거시 product_chats 전용 행은 메뉴 없음 */
  const listMenuRoomId =
    room.source === "chat_room" ? room.id : (room.chatRoomId?.trim() ? room.chatRoomId.trim() : null);

  const detailHref = getRoomHref ? getRoomHref(room.id) : `/chats/${room.id}`;
  const prewarmDetailRoute = () => {
    if (!shouldWarmChatRoute(detailHref)) return;
    prewarmChatRouteData(detailHref);
  };
  const rowClass = "flex min-w-0 flex-1 gap-3 overflow-visible p-3";

  const rowInner = (
    <>
      <div className="relative shrink-0 overflow-visible">
        <div className="h-[100px] w-[100px] shrink-0 overflow-hidden rounded-ui-rect bg-ig-highlight">
          {product?.thumbnail ? (
            <img src={product.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : isExchangeThumb ? (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-emerald-50 text-2xl font-semibold text-gray-700"
              aria-hidden
            >
              <span>{CURRENCY_SYMBOLS.PHP}</span>
              <span className="text-[10px] text-muted">↔</span>
              <span>{CURRENCY_SYMBOLS.KRW}</span>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-gray-400">
              {t("common_image")}
            </div>
          )}
        </div>
        {room.unreadCount > 0 && (
          <span
            className="pointer-events-none absolute right-0 top-0 z-[2] flex h-5 min-w-[20px] translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-md ring-2 ring-white"
            aria-label={t("nav_trade_unread_messages", { count: room.unreadCount > 99 ? "99+" : room.unreadCount })}
          >
            {room.unreadCount > 99 ? "99+" : room.unreadCount}
          </span>
        )}
      </div>
      <div className="flex min-h-[100px] min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px]">
            <span className="shrink-0 rounded-full bg-signature/5 px-2 py-0.5 text-[11px] font-semibold text-gray-800">
              {roleLabel}
            </span>
            <span
              className={`shrink-0 rounded-full bg-ig-highlight px-2 py-0.5 text-[11px] font-medium ${tradeToneClass}`}
              title={tradeStatusLabel}
            >
              {tradeStatusLabel}
            </span>
            <span className="min-w-0 truncate font-medium text-gray-900" title={roleLine}>
              {roleLine}
            </span>
          </div>
          <span className="shrink-0 text-[11px] text-gray-400">
            {room.lastMessageAt ? formatChatTime(room.lastMessageAt) : ""}
          </span>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {rowPreview ? (
            <PostListPreviewColumn
              omitListingBadge
              listingPost={listingPost}
              preview={rowPreview}
              matchThumbnailHeight
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900">
                {productTitle}
              </p>
              <p className="mt-0.5 line-clamp-1 text-[12px] leading-snug text-muted">
                {t("nav_trade_chat_with_partner", { nickname: room.partnerNickname })}
              </p>
              {product && isExchangeLegacy ? (
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-gray-600">
                  {exchangeSubtitleLegacy(product, {
                    amountInquiry: t("nav_trade_amount_inquiry"),
                    exchangeRateUnset: t("nav_trade_exchange_rate_unset"),
                    exchangeRateLabel: (value) => t("nav_trade_exchange_rate_label", { value }),
                  })}
                </p>
              ) : null}
            </div>
          )}
        </div>
        {sellerPreview ? (
          <p className="mt-1 shrink-0 text-[12px] text-signature line-clamp-1">{sellerPreview}</p>
        ) : lastMessageDisplay ? (
          <p className="mt-1 shrink-0 text-[12px] text-gray-600 line-clamp-1">{lastMessageDisplay}</p>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className={`flex gap-0 overflow-visible transition-shadow hover:shadow-[0_3px_8px_rgba(0,0,0,0.12)] ${APP_FEED_LIST_CARD_SHELL}`}
    >
      {onSelectRoom ? (
        <button
          type="button"
          className={`${rowClass} text-left`}
          onMouseEnter={prewarmDetailRoute}
          onTouchStart={prewarmDetailRoute}
          onClick={() => {
            prewarmDetailRoute();
            onSelectRoom(room.id);
          }}
        >
          {rowInner}
        </button>
      ) : (
        <Link
          href={detailHref}
          replace={!!getRoomHref}
          scroll={false}
          prefetch={false}
          onMouseEnter={prewarmDetailRoute}
          onTouchStart={prewarmDetailRoute}
          onClick={prewarmDetailRoute}
          className={rowClass}
        >
          {rowInner}
        </Link>
      )}
      {listMenuRoomId ? (
        <div className="flex shrink-0 flex-col items-end pt-2 pr-2">
          <ChatRoomListMenu roomId={listMenuRoomId} onAfterAction={onRoomMutated} />
        </div>
      ) : null}
    </div>
  );
}

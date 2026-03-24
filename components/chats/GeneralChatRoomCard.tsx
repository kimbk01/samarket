"use client";

import Link from "next/link";
import type { ChatRoom } from "@/lib/types/chat";
import { formatChatTime } from "@/lib/utils/format";
import { trimPreviewForChatRoomRow } from "@/lib/chats/chat-list-preview-trim";
import { PostListPreviewColumn } from "@/components/post/PostListPreviewColumn";
import { APP_FEED_LIST_CARD_SHELL } from "@/lib/ui/app-feed-card";
import { ChatRoomListMenu } from "@/components/chats/ChatRoomListMenu";
import { COMMUNITY_CHAT_SURFACE } from "@/lib/chats/surfaces/community-chat-surface";

const KIND_LABEL: Record<NonNullable<ChatRoom["generalChat"]>["kind"], string> = {
  community: COMMUNITY_CHAT_SURFACE.tradeListRoomBadgeLabel,
  group: "모임",
  business: "비즈",
  legacy_general: "일반",
  store_order: "매장 주문",
};

interface Props {
  room: ChatRoom;
  onRoomMutated?: () => void;
  /** 미지정 시 `/chats/[id]` */
  getRoomHref?: (roomId: string) => string;
}

export function GeneralChatRoomCard({ room, onRoomMutated, getRoomHref }: Props) {
  const kind = room.generalChat?.kind ?? "legacy_general";
  const label = KIND_LABEL[kind];
  const detailHref = getRoomHref ? getRoomHref(room.id) : `/chats/${room.id}`;
  const product = room.product;
  const rowPreview = product?.listPreview ? trimPreviewForChatRoomRow(product.listPreview) : null;
  const listingPost = {
    seller_listing_state: product?.sellerListingState,
    status: product?.status,
    type: "trade" as const,
  };

  return (
    <div
      className={`relative flex flex-col gap-2 overflow-visible transition-shadow hover:shadow-[0_3px_8px_rgba(0,0,0,0.12)] ${APP_FEED_LIST_CARD_SHELL}`}
    >
      {room.unreadCount > 0 && (
        <span className="absolute right-11 top-2 z-[1] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
          {room.unreadCount > 99 ? "99+" : room.unreadCount}
        </span>
      )}
      <div className="absolute right-1 top-1 z-[20]">
        <ChatRoomListMenu roomId={room.id} onAfterAction={onRoomMutated} />
      </div>
      <Link href={detailHref} replace={!!getRoomHref} scroll={false} className="flex flex-col gap-2 p-3 pr-11">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[15px] font-semibold text-gray-900">
          <span className="mr-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">
            {label}
          </span>
          {room.partnerNickname}
        </p>
        <time className="shrink-0 text-[12px] text-gray-400">{formatChatTime(room.lastMessageAt)}</time>
      </div>
      <p className="line-clamp-2 text-[14px] text-gray-600">{room.lastMessage || "대화를 시작해 보세요"}</p>
      {rowPreview ? (
        <div className="flex gap-3 border-t border-gray-100 pt-2">
          <div className="h-[100px] w-[100px] shrink-0 overflow-hidden rounded-none bg-gray-100">
            {product?.thumbnail ? (
              <img src={product.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-gray-400">
                이미지
              </div>
            )}
          </div>
          <div className="flex min-h-[100px] min-w-0 flex-1 flex-col">
            <PostListPreviewColumn
              omitListingBadge
              listingPost={listingPost}
              preview={rowPreview}
              matchThumbnailHeight
            />
          </div>
        </div>
      ) : null}
      {!rowPreview && product?.title ? (
        <p className="truncate text-[12px] text-gray-500">{product.title}</p>
      ) : null}
      </Link>
    </div>
  );
}

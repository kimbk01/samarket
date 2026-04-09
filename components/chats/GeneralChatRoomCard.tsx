"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ChatRoom } from "@/lib/types/chat";
import { formatChatTime } from "@/lib/utils/format";
import { APP_FEED_LIST_CARD_SHELL } from "@/lib/ui/app-feed-card";
import { ChatRoomListMenu } from "@/components/chats/ChatRoomListMenu";

interface Props {
  room: ChatRoom;
  onRoomMutated?: () => void;
  /** 미지정 시 `/chats/[id]` */
  getRoomHref?: (roomId: string) => string;
  onSelectRoom?: (roomId: string) => void;
}

export function GeneralChatRoomCard({ room, onRoomMutated, getRoomHref, onSelectRoom }: Props) {
  const { t } = useI18n();
  const kind = room.generalChat?.kind ?? "legacy_general";
  const label =
    kind === "community" || kind === "legacy_general"
      ? t("nav_chat_kind_general")
      : kind === "group"
        ? t("nav_chat_kind_group")
        : kind === "open_chat"
          ? t("nav_chat_kind_open")
          : kind === "business"
            ? t("nav_chat_kind_business")
            : t("nav_chat_kind_store_order");
  const detailHref = getRoomHref ? getRoomHref(room.id) : `/chats/${room.id}`;
  const product = room.product;
  const title = room.roomTitle?.trim() || room.partnerNickname;
  const subtitle = room.roomSubtitle?.trim() || product?.regionLabel || "";
  const isStoreOrder = kind === "store_order";
  const statusSummary = isStoreOrder
    ? subtitle.replace(/^주문 상태\s*·\s*/, "").trim() || t("common_need_check")
    : "";

  const rowClass = "flex flex-col gap-2 p-3 pr-11";

  const rowInner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="min-w-0 truncate text-[15px] font-semibold text-gray-900">
            <span className="mr-1.5 rounded bg-signature/10 px-1.5 py-0.5 text-[11px] font-medium text-gray-800">
              {label}
            </span>
            {title}
          </p>
          {isStoreOrder ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                {t("nav_chat_order_status")}
              </span>
              <span className="text-[12px] font-medium text-gray-700">{statusSummary}</span>
            </div>
          ) : null}
        </div>
        <time className="shrink-0 text-[12px] text-gray-400">{formatChatTime(room.lastMessageAt)}</time>
      </div>
      {isStoreOrder ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2.5">
          <p className="text-[12px] font-medium text-gray-900">{t("nav_chat_order_follow_notice")}</p>
          <p className="mt-1 line-clamp-2 text-[12px] text-gray-600">{room.lastMessage || t("nav_chat_start_conversation")}</p>
        </div>
      ) : (
        <p className="line-clamp-2 text-[14px] text-gray-600">{room.lastMessage || t("nav_chat_start_conversation")}</p>
      )}
      {product?.thumbnail || product?.title ? (
        <div className="flex gap-3 border-t border-gray-100 pt-2">
          <div className="h-[100px] w-[100px] shrink-0 overflow-hidden rounded-md bg-ig-highlight">
            {product?.thumbnail ? (
              <img src={product.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-gray-400">
                {t("common_image")}
              </div>
            )}
          </div>
          <div className="flex min-h-[100px] min-w-0 flex-1 flex-col">
            <p className="line-clamp-2 text-[14px] font-medium text-gray-900">
              {product?.title || title}
            </p>
            {subtitle ? (
              <p className="mt-1 text-[12px] text-muted">{subtitle}</p>
            ) : null}
            {isStoreOrder ? (
              <p className="mt-2 text-[12px] font-medium text-signature">{t("nav_chat_continue_order_context")}</p>
            ) : null}
            {(kind === "group" || kind === "open_chat") && typeof room.memberCount === "number" ? (
              <p className="mt-2 text-[12px] font-medium text-signature">
                {kind === "open_chat" ? t("nav_chat_participants") : t("nav_chat_members")}{" "}
                {t("nav_chat_count_people", { count: room.memberCount })}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {!product?.thumbnail && !product?.title && subtitle ? (
        <p className="truncate text-[12px] text-muted">{subtitle}</p>
      ) : null}
      {!product?.thumbnail && !subtitle && product?.title ? (
        <p className="truncate text-[12px] text-muted">{product.title}</p>
      ) : null}
    </>
  );

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
      {onSelectRoom ? (
        <button type="button" className={`${rowClass} text-left`} onClick={() => onSelectRoom(room.id)}>
          {rowInner}
        </button>
      ) : (
        <Link href={detailHref} replace={!!getRoomHref} scroll={false} className={rowClass}>
          {rowInner}
        </Link>
      )}
    </div>
  );
}

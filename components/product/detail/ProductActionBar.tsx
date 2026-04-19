"use client";

import Link from "next/link";
import type { Product } from "@/lib/types/product";
import { ChatButton } from "@/components/chats/ChatButton";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import type { ChatRoomSource } from "@/lib/types/chat";
import {
  PRODUCT_DETAIL_BOTTOM_BAR,
  PRODUCT_DETAIL_CTA_BUTTON,
} from "./product-detail-bottom-constants";

const STATUS_LABEL: Record<Product["status"], string> = {
  active: "판매중",
  reserved: "예약중",
  sold: "판매완료",
  hidden: "숨김",
  blinded: "블라인드",
  deleted: "삭제됨",
};

interface ProductActionBarProps {
  product: Product;
  /** 당근형: 있으면 CTA "대화중인 채팅"으로 표시 */
  existingRoomId?: string | null;
  existingRoomSource?: ChatRoomSource | null;
  existingMessengerRoomId?: string | null;
  /** 판매자 본인일 때 true → 채팅하기 대신 "채팅 목록 보기" 표시 */
  amISeller?: boolean;
}

/**
 * 당근형: 하단 CTA 1개 (채팅하기 / 대화중인 채팅) + 상태 뱃지
 * 글 상세(PostDetailView)와 동일 하단 바 규격
 */
export function ProductActionBar({
  product,
  existingRoomId,
  existingRoomSource,
  existingMessengerRoomId,
  amISeller,
}: ProductActionBarProps) {
  return (
    <div data-product-detail-action-bar="true" className={`${PRODUCT_DETAIL_BOTTOM_BAR} z-10`}>
      <span
        className={`shrink-0 rounded px-2 py-1 text-[11px] font-medium ${
          product.status === "sold"
            ? "bg-sam-border-soft text-sam-muted"
            : product.status === "reserved"
              ? "bg-amber-100 text-amber-800"
              : product.status === "hidden"
                ? "bg-sam-border-soft text-sam-muted"
                : "bg-sam-surface-muted text-sam-fg"
        }`}
      >
        {STATUS_LABEL[product.status]}
      </span>
      {amISeller ? (
        <Link href={TRADE_CHAT_SURFACE.messengerListHref} className={PRODUCT_DETAIL_CTA_BUTTON}>
          채팅 목록 보기
        </Link>
      ) : (
        <div className="min-w-0 flex-1">
          <ChatButton
            productId={product.id}
            existingRoomId={existingRoomId}
            existingRoomSource={existingRoomSource}
            existingMessengerRoomId={existingMessengerRoomId}
            disabled={product.status === "sold"}
            className={PRODUCT_DETAIL_CTA_BUTTON}
          />
        </div>
      )}
    </div>
  );
}

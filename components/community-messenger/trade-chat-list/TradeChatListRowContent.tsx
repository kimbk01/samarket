"use client";

import type { ReactNode } from "react";
import { MessengerListRow } from "@/components/community-messenger/line-ui";

type Props = {
  rowSurfaceClass: string;
  avatar: ReactNode;
  trailing: ReactNode;
  productTitle: string;
  productPriceText: string | null;
  previewLine: string;
  unread: boolean;
};

/**
 * `/community-messenger/trade-chats` 전용 — 상품 썸네일·제목·미리보기 3줄 레이아웃만 담당.
 * 스와이프·탭 네비는 부모 `MessengerChatListItem` 이 유지한다.
 */
export function TradeChatListRowContent({
  rowSurfaceClass,
  avatar,
  trailing,
  productTitle,
  productPriceText,
  previewLine,
  unread,
}: Props) {
  return (
    <MessengerListRow
      className={`min-h-[72px] max-h-[84px] py-1 ${rowSurfaceClass}`}
      avatarSlotClassName="flex h-14 w-14 shrink-0 items-center justify-center"
      avatar={avatar}
      trailing={trailing}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span
          className="shrink-0 rounded-[6px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-1.5 py-px sam-text-xxs font-semibold leading-none"
          style={{ color: "var(--messenger-text-secondary)" }}
        >
          거래
        </span>
        {productPriceText ? (
          <span className="min-w-0 truncate sam-text-helper font-normal leading-tight" style={{ color: "var(--messenger-text-secondary)" }}>
            {productPriceText}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 min-w-0 truncate sam-text-body font-semibold leading-tight" style={{ color: "var(--messenger-text)" }}>
        {productTitle}
      </p>
      <p
        className={`mt-0.5 min-w-0 truncate sam-text-body-secondary font-normal leading-snug ${unread ? "font-medium" : ""}`}
        style={{ color: unread ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
      >
        {previewLine}
      </p>
    </MessengerListRow>
  );
}

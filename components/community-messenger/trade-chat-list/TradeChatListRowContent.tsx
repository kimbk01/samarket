"use client";

import type { ReactNode } from "react";
import { MessengerListRow } from "@/components/community-messenger/line-ui";

type Props = {
  rowSurfaceClass: string;
  avatar: ReactNode;
  trailing: ReactNode;
  categoryChipLabel: string;
  productTitle: string;
  productPriceText: string | null;
  previewLine: string;
  /** 4행 — 판매자/작성자 표시명(서버 `sellerDisplayName` + 접두) */
  listingOwnerLine: string | null;
  unread: boolean;
};

/**
 * `/community-messenger/trade-chats` 전용 — 대메뉴 칩 · 제목·가격 · 미리보기 · 판매자/작성자 한 줄 + 우측 시간·상태.
 * 스와이프·탭 네비는 부모 `MessengerChatListItem` 이 유지한다.
 */
export function TradeChatListRowContent({
  rowSurfaceClass,
  avatar,
  trailing,
  categoryChipLabel,
  productTitle,
  productPriceText,
  previewLine,
  listingOwnerLine,
  unread,
}: Props) {
  return (
    <MessengerListRow
      className={`min-h-[96px] max-h-[120px] py-1.5 ${rowSurfaceClass}`}
      avatarSlotClassName="flex h-14 w-14 shrink-0 items-center justify-center"
      avatar={avatar}
      trailing={trailing}
    >
      <div className="flex min-w-0 items-center">
        <span
          className="max-w-full truncate rounded-[6px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-1.5 py-px sam-text-xxs font-semibold leading-none"
          style={{ color: "var(--messenger-text-secondary)" }}
        >
          {categoryChipLabel}
        </span>
      </div>
      <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        <p className="min-w-0 flex-1 truncate sam-text-body font-semibold leading-tight" style={{ color: "var(--messenger-text)" }}>
          {productTitle}
        </p>
        {productPriceText ? (
          <span className="shrink-0 max-w-[42%] truncate sam-text-helper font-semibold leading-tight" style={{ color: "var(--messenger-text)" }}>
            {productPriceText}
          </span>
        ) : null}
      </div>
      <p
        className={`mt-0.5 min-w-0 truncate sam-text-body-secondary font-normal leading-snug ${unread ? "font-medium" : ""}`}
        style={{ color: unread ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
      >
        {previewLine}
      </p>
      {listingOwnerLine ? (
        <p
          className="mt-0.5 min-w-0 truncate sam-text-xxs font-normal leading-tight"
          style={{ color: "var(--messenger-text-secondary)" }}
        >
          {listingOwnerLine}
        </p>
      ) : null}
    </MessengerListRow>
  );
}

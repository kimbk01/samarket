"use client";

import type { ReactNode } from "react";
import { MessengerListRow } from "@/components/community-messenger/line-ui";

type Props = {
  rowSurfaceClass: string;
  avatar: ReactNode;
  trailing: ReactNode;
  storeName: string;
  orderNoLine: string | null;
  deliveryStatusLine: string | null;
  lastMessageLine: string;
  unread: boolean;
};

/**
 * `/community-messenger/delivery-chats` — 매장 프로필 + (1)매장명 (2)주문번호 (3)배달상황 (4)마지막 메시지.
 */
export function DeliveryChatListRowContent({
  rowSurfaceClass,
  avatar,
  trailing,
  storeName,
  orderNoLine,
  deliveryStatusLine,
  lastMessageLine,
  unread,
}: Props) {
  return (
    <MessengerListRow
      className={`min-h-[96px] max-h-[128px] py-1.5 ${rowSurfaceClass}`}
      avatarSlotClassName="flex h-14 w-14 shrink-0 items-center justify-center"
      avatar={avatar}
      trailing={trailing}
    >
      <p className="min-w-0 truncate sam-text-body font-semibold leading-tight" style={{ color: "var(--messenger-text)" }}>
        {storeName}
      </p>
      {orderNoLine ? (
        <p
          className="mt-0.5 min-w-0 truncate sam-text-helper font-medium leading-snug tabular-nums"
          style={{ color: "var(--messenger-text-secondary)" }}
        >
          {orderNoLine}
        </p>
      ) : null}
      {deliveryStatusLine ? (
        <p
          className="mt-0.5 min-w-0 truncate sam-text-helper font-semibold leading-snug"
          style={{ color: "var(--messenger-text)" }}
        >
          {deliveryStatusLine}
        </p>
      ) : null}
      {lastMessageLine.trim() ? (
        <p
          className={`mt-0.5 min-w-0 truncate sam-text-body-secondary font-normal leading-snug ${unread ? "font-medium" : ""}`}
          style={{ color: unread ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
        >
          {lastMessageLine}
        </p>
      ) : null}
    </MessengerListRow>
  );
}

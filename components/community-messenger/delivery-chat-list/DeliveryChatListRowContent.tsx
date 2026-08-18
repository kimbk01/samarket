"use client";

import type { ReactNode } from "react";

type Props = {
  rowSurfaceClass: string;
  avatar: ReactNode;
  trailing: ReactNode;
  storeName: string;
  previewLine: string;
  statusLabel: string;
  statusBadgeClassName: string;
  unread: boolean;
};

const ONE_LINE = "min-w-0 truncate whitespace-nowrap overflow-hidden";

/**
 * `/community-messenger/delivery-chats` — 3행(매장명·마지막 메시지·상태) + 우측 시간·unread.
 */
export function DeliveryChatListRowContent({
  rowSurfaceClass,
  avatar,
  trailing,
  storeName,
  previewLine,
  statusLabel,
  statusBadgeClassName,
  unread,
}: Props) {
  return (
    <div
      className={`flex min-h-[72px] items-center gap-3 px-4 py-3 transition-transform duration-100 active:scale-[0.985] active:bg-[#EAF4EF] ${rowSurfaceClass}`}
    >
      <div className="shrink-0">{avatar}</div>
      <div className="min-w-0 flex-1">
        <p
          data-cm-list-title=""
          className={`${ONE_LINE} sam-text-body font-semibold leading-tight`}
          style={{ color: "var(--messenger-text)" }}
        >
          {storeName}
        </p>
        <p
          className={`mt-0.5 ${ONE_LINE} sam-text-body-secondary font-normal leading-snug ${
            unread ? "font-medium" : ""
          }`}
          style={{ color: unread ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
        >
          {previewLine || "\u00a0"}
        </p>
        {statusLabel ? (
          <p className={`mt-0.5 flex min-w-0 items-center ${ONE_LINE}`}>
            <span className={`shrink-0 ${statusBadgeClassName}`}>{statusLabel}</span>
          </p>
        ) : null}
      </div>
      <div className="flex w-[56px] min-w-[56px] shrink-0 flex-col items-end justify-start self-stretch pt-0.5">
        {trailing}
      </div>
    </div>
  );
}

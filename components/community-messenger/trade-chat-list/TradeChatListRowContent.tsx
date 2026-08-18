"use client";

import type { ReactNode } from "react";

type Props = {
  rowSurfaceClass: string;
  avatar: ReactNode;
  trailing: ReactNode;
  productTitle: string;
  previewLine: string;
  rolePrefix: string | null;
  productPriceText: string | null;
  statusLabel: string;
  statusBadgeClassName: string;
  unread: boolean;
};

const ONE_LINE = "min-w-0 truncate whitespace-nowrap overflow-hidden";

/**
 * `/community-messenger/trade-chats` — 메신저 공통 타이포 + 3행 본문 + 우측 시간·unread.
 */
export function TradeChatListRowContent({
  rowSurfaceClass,
  avatar,
  trailing,
  productTitle,
  previewLine,
  rolePrefix,
  productPriceText,
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
          {productTitle}
        </p>
        <p
          className={`mt-0.5 ${ONE_LINE} sam-text-body-secondary font-normal leading-snug ${
            unread ? "font-medium" : ""
          }`}
          style={{ color: unread ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
        >
          {previewLine}
        </p>
        <p
          className={`mt-0.5 flex min-w-0 items-center gap-1 ${ONE_LINE} sam-text-helper font-normal leading-snug`}
          style={{ color: "var(--messenger-text-secondary)" }}
        >
          {rolePrefix ? <span className="shrink-0">{rolePrefix}</span> : null}
          {rolePrefix && (productPriceText || statusLabel) ? (
            <span className="shrink-0 text-[color:var(--messenger-text-secondary)]"> · </span>
          ) : null}
          {productPriceText ? <span className="shrink-0 font-medium">{productPriceText}</span> : null}
          {productPriceText && statusLabel ? (
            <span className="shrink-0 text-[color:var(--messenger-text-secondary)]"> · </span>
          ) : null}
          {statusLabel ? (
            <span className={`shrink-0 ${statusBadgeClassName}`}>{statusLabel}</span>
          ) : null}
        </p>
      </div>
      <div className="flex w-[56px] min-w-[56px] shrink-0 flex-col items-end justify-start self-stretch pt-0.5">
        {trailing}
      </div>
    </div>
  );
}

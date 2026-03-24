"use client";

import Link from "next/link";
import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
import { useOwnerCommerceNotificationUnreadCount } from "@/hooks/useOwnerCommerceNotificationUnreadCount";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";

type Props = {
  shopName: string;
  /** 공개 매장 (승인·노출 시) */
  publicStoreHref: string | null;
};

/** 내 매장 허브 1단 — 매장 탭 루트와 동일 `TradePrimaryColumnStickyAppBar` 패턴 */
export function MyBusinessHubStickyHeader({ shopName, publicStoreHref }: Props) {
  const ownerCommerceUnread = useOwnerCommerceNotificationUnreadCount();

  return (
    <TradePrimaryColumnStickyAppBar
      title={shopName}
      hideBackButton
      backButtonProps={{ backHref: "/my", ariaLabel: "내 정보로" }}
      actions={
        <>
          <Link
            href="/my/business/store-orders?ack_owner_notifications=1"
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-white/80"
            aria-label={
              ownerCommerceUnread != null && ownerCommerceUnread > 0
                ? `매장 주문 알림 ${ownerCommerceUnread}건, 주문 관리로 이동`
                : "매장 주문 알림 · 주문 관리"
            }
          >
            <span className="text-[18px] leading-none" aria-hidden>
              🔔
            </span>
            {ownerCommerceUnread != null && ownerCommerceUnread > 0 ? (
              <span className={`${OWNER_HUB_BADGE_DOT_CLASS} ring-white/80`}>
                {ownerCommerceUnread > 99 ? "99+" : ownerCommerceUnread}
              </span>
            ) : null}
          </Link>
          {publicStoreHref ? (
            <Link
              href={publicStoreHref}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-white/80"
              aria-label="공개 매장 페이지"
            >
              <span className="text-[20px] leading-none" aria-hidden>
                ⌂
              </span>
            </Link>
          ) : (
            <span className="h-11 w-11 shrink-0" aria-hidden />
          )}
        </>
      }
    />
  );
}

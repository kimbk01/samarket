"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getDemoBuyerUserId } from "@/lib/member-orders/member-order-store";
import { countUnreadForTarget } from "@/lib/shared-notifications/shared-notification-store";
import { useSharedNotificationsVersion } from "@/lib/shared-notifications/use-shared-notifications-version";

export function MemberNotificationBell() {
  const v = useSharedNotificationsVersion();
  const buyerId = getDemoBuyerUserId();
  const n = useMemo(() => {
    void v;
    if (!buyerId) return 0;
    return countUnreadForTarget("member", buyerId);
  }, [buyerId, v]);

  return (
    <Link
      href="/my/notifications#order-sim"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-ig-border bg-sam-surface text-foreground"
      aria-label={`주문 알림 ${n > 0 ? `${n}건 읽지 않음` : ""}`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      {n > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </Link>
  );
}

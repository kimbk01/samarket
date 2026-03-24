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
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700"
      aria-label={`주문 알림 ${n > 0 ? `${n}건 읽지 않음` : ""}`}
    >
      <span className="text-[16px] leading-none">🔔</span>
      {n > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </Link>
  );
}

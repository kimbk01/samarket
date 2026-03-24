"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getMockSession } from "@/lib/mock-auth/mock-auth-store";
import { useMockAuthVersion } from "@/lib/mock-auth/use-mock-auth-version";
import { DEMO_ADMIN_USER_ID } from "@/lib/shared-notifications/constants";
import { countUnreadForTarget } from "@/lib/shared-notifications/shared-notification-store";
import { useSharedNotificationsVersion } from "@/lib/shared-notifications/use-shared-notifications-version";

export function AdminNotificationBell() {
  const av = useMockAuthVersion();
  const v = useSharedNotificationsVersion();
  const adminId = useMemo(() => {
    void av;
    const s = getMockSession();
    return s.role === "admin" ? DEMO_ADMIN_USER_ID : null;
  }, [av]);
  const n = useMemo(() => {
    void v;
    if (!adminId) return 0;
    return countUnreadForTarget("admin", adminId);
  }, [adminId, v]);

  return (
    <Link
      href="/admin/order-notifications"
      className="relative inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] font-medium text-gray-800"
    >
      🔔 알림
      {n > 0 ? (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </Link>
  );
}

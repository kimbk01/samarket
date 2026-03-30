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
      className="relative inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DBDBDB] bg-white px-2.5 text-[12px] font-medium text-[#262626]"
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      알림
      {n > 0 ? (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </Link>
  );
}

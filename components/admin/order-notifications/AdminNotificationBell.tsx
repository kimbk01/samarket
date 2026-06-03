"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";

/**
 * 어드민 전용 알림 벨.
 *
 * /api/admin/admin-bell 에서 어드민 액션 필요 항목(충전 대기·신고·배달 알림)을
 * 집계해 뱃지로 표시한다. 일반 유저 알림 API(/api/me/notifications)와 무관.
 */
export function AdminNotificationBell() {
  const { t } = useI18n();
  const { adminBellCount: count } = useAdminStorePointPendingCount();

  return (
    <Link
      href="/admin/reports"
      className="relative inline-flex h-9 items-center gap-1.5 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 sam-text-helper font-medium text-foreground"
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      {t("admin_order_notif_bell")}
      {count > 0 ? (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 sam-text-xxs font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

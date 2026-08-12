"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { NOTIFICATION_SYNC_POLL_MS } from "@/lib/notifications/notification-events";

type BellPayload = {
  ok?: boolean;
  total?: number;
  by_category?: {
    charges?: number;
    store_charges?: number;
    user_charges?: number;
    reports?: number;
    alerts?: number;
    feed_ad_requests?: number;
    member_inquiry_open?: number;
    store_inquiry_open?: number;
    platform_inquiry_open?: number;
    community_reports?: number;
  };
};

type QueueRow = {
  href: string;
  count: number;
  titleKo: string;
  titleEn: string;
};

/**
 * Admin ops Action Queue surface — ADMIN ACTION QUEUE SSOT via admin-bell.
 * DO NOT read Member me-notifications inbox as Admin ops authority.
 */
export function AdminOrderNotificationsPageClient() {
  const { language, safeT } = useI18n();
  const [payload, setPayload] = useState<BellPayload | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/admin-bell", {
        credentials: "include",
        cache: "no-store",
        dedupeKey: "admin:order-notifications:action-queue",
        cacheTtlMs: 5_000,
      });
      const json = (await res.json().catch(() => ({}))) as BellPayload;
      if (!res.ok || !json.ok) {
        setError(true);
        setPayload(null);
        return;
      }
      setPayload(json);
      setError(false);
    } catch {
      setError(true);
      setPayload(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, NOTIFICATION_SYNC_POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const c = payload?.by_category;
  const rows: QueueRow[] = [
    {
      href: "/admin/store-point-charges",
      count: c?.store_charges ?? 0,
      titleKo: "매장 Business Credit 입금",
      titleEn: "Store Business Credit charges",
    },
    {
      href: "/admin/point-charges",
      count: c?.user_charges ?? 0,
      titleKo: "회원 포인트 입금",
      titleEn: "Member point charges",
    },
    {
      href: "/admin/feed-ad-requests",
      count: c?.feed_ad_requests ?? 0,
      titleKo: "피드 배너 광고 심사",
      titleEn: "Feed banner ad review",
    },
    {
      href: "/admin/reports",
      count: c?.reports ?? 0,
      titleKo: "신고 (회원·매장)",
      titleEn: "Reports (member · store)",
    },
    {
      href: "/admin/delivery-operations",
      count: c?.alerts ?? 0,
      titleKo: "배달 운영 알림",
      titleEn: "Delivery operation alerts",
    },
    {
      href: "/admin/member-notes?kind=inquiry",
      count: c?.member_inquiry_open ?? 0,
      titleKo: "회원 문의",
      titleEn: "Member inquiries",
    },
    {
      href: "/admin/store-inquiries",
      count: c?.store_inquiry_open ?? 0,
      titleKo: "매장 문의",
      titleEn: "Store inquiries",
    },
    {
      href: "/admin/platform-inquiries",
      count: c?.platform_inquiry_open ?? 0,
      titleKo: "플랫폼 문의",
      titleEn: "Platform inquiries",
    },
    {
      href: "/admin/community/reports",
      count: c?.community_reports ?? 0,
      titleKo: "커뮤니티 신고",
      titleEn: "Community reports",
    },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader
        titleKey="admin_order_notifications_title"
        descriptionKey="admin_order_notifications_desc"
      />
      <p className="text-sm text-sam-muted">
        {safeT("admin_cp_action_queue_total", {
          fallbackKo: `처리 대기 ${payload?.total ?? 0}건`,
          fallbackEn: `${payload?.total ?? 0} actions pending`,
          vars: { count: String(payload?.total ?? 0) },
        })}
      </p>
      {error ? (
        <p className="text-sm text-red-600">
          {safeT("admin_cp_dashboard_load_error", {
            fallbackKo: "액션 큐를 불러오지 못했습니다.",
            fallbackEn: "Failed to load action queue.",
          })}
        </p>
      ) : null}
      <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
        {rows.map((row) => (
          <li key={row.href}>
            <Link
              href={row.href}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-sam-fg hover:bg-sam-app"
            >
              <span>{language === "en" ? row.titleEn : row.titleKo}</span>
              <span className="tabular-nums font-medium">{row.count > 0 ? row.count : "—"}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-sam-muted">
        <Link href="/admin/order-notifications/settings" className="text-signature underline">
          {language === "en" ? "Notification sound settings" : "알림음 설정"}
        </Link>
      </p>
    </div>
  );
}

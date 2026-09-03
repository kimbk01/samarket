"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";

type OverviewPayload = {
  ok?: boolean;
  action_queue?: {
    support_actionable?: number;
    member_inquiry_open: number;
    store_inquiry_open: number;
    platform_inquiry_open: number;
    member_charge_pending: number;
    store_charge_pending: number;
    feed_ad_pending?: number;
    reports_pending?: number;
    delivery_alerts?: number;
    community_reports_pending?: number;
    total: number;
  };
  monitoring?: {
    member_inbox_threads: number;
    app_notices_active: number;
    notification_campaigns: number;
  };
};

type LoadState = "loading" | "ready" | "error";

type QueueCard = {
  href: string;
  count: number;
  titleKey: MessageKey;
  titleKo: string;
  titleEn: string;
  domain: "member" | "store";
};

export function CustomerPlatformDashboardPage() {
  const { safeT } = useI18n();
  const [payload, setPayload] = useState<OverviewPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const res = await fetch("/api/admin/customer-platform/overview", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as OverviewPayload;
      if (!res.ok || !json.ok) {
        setPayload(null);
        setLoadState("error");
        return;
      }
      setPayload(json);
      setLoadState("ready");
    } catch {
      setPayload(null);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const aq = payload?.action_queue;
  const mon = payload?.monitoring;

  const queueCards: QueueCard[] = [
    {
      href: "/admin/support?filter=WAITING_ADMIN",
      count: aq?.support_actionable ?? 0,
      titleKey: "admin_cp_queue_support_actionable",
      titleKo: "고객센터 조치 필요",
      titleEn: "Support actionable",
      domain: "member",
    },
    {
      href: "/admin/store-inquiries",
      count: aq?.store_inquiry_open ?? 0,
      titleKey: "admin_cp_queue_store_inquiry",
      titleKo: "매장 문의 (open)",
      titleEn: "Store inquiry (open)",
      domain: "store",
    },
    {
      href: "/admin/point-charges",
      count: aq?.member_charge_pending ?? 0,
      titleKey: "admin_cp_queue_member_deposit",
      titleKo: "회원 입금 승인 대기",
      titleEn: "Member deposit pending",
      domain: "member",
    },
    {
      href: "/admin/delivery-ads/cash-charges",
      count: aq?.store_charge_pending ?? 0,
      titleKey: "admin_cp_queue_store_deposit",
      titleKo: "매장 입금 승인 대기",
      titleEn: "Store deposit pending",
      domain: "store",
    },
    {
      href: "/admin/feed-ad-requests",
      count: aq?.feed_ad_pending ?? 0,
      titleKey: "admin_menu_ads_feed_applications",
      titleKo: "피드 배너 광고 심사 (Growth)",
      titleEn: "Feed banner ad review (Growth)",
      domain: "member",
    },
    {
      href: "/admin/reports",
      count: aq?.reports_pending ?? 0,
      titleKey: "admin_menu_reports_observation",
      titleKo: "신고 표시 큐 (관찰)",
      titleEn: "Reports display queue (observation)",
      domain: "member",
    },
    {
      href: "/admin/delivery-operations",
      count: aq?.delivery_alerts ?? 0,
      titleKey: "admin_menu_delivery_operations_stats",
      titleKo: "배달 운영 알림",
      titleEn: "Delivery operation alerts",
      domain: "store",
    },
    {
      href: "/admin/community/reports",
      count: aq?.community_reports_pending ?? 0,
      titleKey: "admin_menu_community_reports",
      titleKo: "커뮤니티 신고",
      titleEn: "Community reports",
      domain: "member",
    },
  ];

  return (
    <div className="sam-page-stack">
      <AdminPageHeader titleKey="admin_menu_customer_platform" />

      <p className="sam-text-body-secondary text-sam-muted">
        {safeT("admin_cp_dashboard_intro", {
          fallbackKo:
            "회원(Member)과 매장(Store) 고객지원·포인트·알림을 한곳에서 운영합니다. 아래 큐에서 즉시 처리하세요.",
          fallbackEn:
            "Operate Member and Store support, points, and notifications in one place. Start from the action queue below.",
        })}
      </p>

      {loadState === "error" ? (
        <div
          className="rounded-ui-rect border border-sam-warning/15 bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-warning"
          role="alert"
        >
          <p className="font-medium">
            {safeT("admin_cp_dashboard_load_error", {
              fallbackKo: "운영 현황을 불러오지 못했습니다.",
              fallbackEn: "Could not load Customer Platform overview.",
            })}
          </p>
          <button type="button" onClick={() => void load()} className="sam-btn sam-btn--outline sam-btn--sm mt-3">
            {safeT("admin_dashboard_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}

      <section id="action-queue" className="space-y-3 scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="sam-text-section-title font-semibold text-sam-fg">
            {safeT("admin_menu_cp_action_queue", {
              fallbackKo: "Action Queue",
              fallbackEn: "Action Queue",
            })}
          </h2>
          <p className="sam-text-helper text-sam-muted tabular-nums">
            {loadState === "loading"
              ? "…"
              : `${safeT("admin_cp_action_queue_total", {
                  fallbackKo: "대기",
                  fallbackEn: "Pending",
                })} ${aq?.total ?? 0}`}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {queueCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 transition-colors hover:border-signature/40 hover:bg-sam-app"
            >
              <p className="sam-text-helper text-sam-muted">
                {card.domain === "member"
                  ? safeT("admin_menu_cp_points_member", { fallbackKo: "Member", fallbackEn: "Member" })
                  : safeT("admin_menu_store_points", { fallbackKo: "Store", fallbackEn: "Store" })}
              </p>
              <p className="mt-1 sam-text-body font-semibold text-sam-fg">
                {safeT(card.titleKey, {
                  fallbackKo: card.titleKo,
                  fallbackEn: card.titleEn,
                })}
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-signature">
                {loadState === "loading" ? "…" : card.count}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section id="monitoring" className="space-y-3 scroll-mt-20">
        <h2 className="sam-text-section-title font-semibold text-sam-fg">
          {safeT("admin_menu_cp_monitoring", {
            fallbackKo: "Monitoring",
            fallbackEn: "Monitoring",
          })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/admin/app/notices"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
          >
            <p className="sam-text-body font-semibold text-sam-fg">
              {safeT("admin_menu_notices", { fallbackKo: "공지", fallbackEn: "Notices" })}
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-sam-fg">
              {loadState === "loading" ? "…" : (mon?.app_notices_active ?? 0)}
            </p>
            <p className="sam-text-helper text-sam-muted">
              {safeT("admin_cp_mon_notices_hint", {
                fallbackKo: "활성 공지",
                fallbackEn: "Active notices",
              })}
            </p>
          </Link>
          <Link
            href="/admin/member-notes?kind=inbox"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
          >
            <p className="sam-text-body font-semibold text-sam-fg">
              {safeT("admin_menu_cp_member_inbox", {
                fallbackKo: "회원 쪽지",
                fallbackEn: "Member inbox",
              })}
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-sam-fg">
              {loadState === "loading" ? "…" : (mon?.member_inbox_threads ?? 0)}
            </p>
          </Link>
          <Link
            href="/admin/notifications"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
          >
            <p className="sam-text-body font-semibold text-sam-fg">
              {safeT("admin_menu_dibay_notification_campaigns", {
                fallbackKo: "알림 엔진",
                fallbackEn: "Notification Engine",
              })}
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-sam-fg">
              {loadState === "loading" ? "…" : (mon?.notification_campaigns ?? 0)}
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}

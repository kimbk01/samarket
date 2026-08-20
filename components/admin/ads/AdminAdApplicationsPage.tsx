"use client";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCommunityPromotionQueue } from "@/components/admin/ads/AdminCommunityPromotionQueue";
import { AdminFeedAdRequestQueue } from "@/components/admin/ads/AdminFeedAdRequestQueue";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * /admin/ad-applications — three separate domain queues on one route (KEEP).
 * NOT a unified ads table. Writers stay per queue.
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 * CUT 1: domain section ownership labels (Trade / Community / Feed Banner).
 */
export function AdminAdApplicationsPage() {
  const { safeT } = useI18n();
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={safeT("admin_ad_applications_title", {
          fallbackKo: "광고·홍보 신청 (도메인별 큐)",
          fallbackEn: "Ad / promote requests (per-domain queues)",
        })}
        description={safeT("admin_ad_applications_desc", {
          fallbackKo:
            "한 화면에 세 큐를 두지만 테이블·writer는 분리됩니다. Trade=point_promotion_orders(domain=trade) · Community=point_promotion_orders(domain=community) · Feed Banner=feed_ad_requests. 레거시 trade_post_ads는 /admin/trade-post-ads.",
          fallbackEn:
            "Three queues on one route; tables and writers stay separate. Trade=point_promotion_orders(domain=trade) · Community=point_promotion_orders(domain=community) · Feed Banner=feed_ad_requests. Legacy trade_post_ads: /admin/trade-post-ads.",
        })}
      />
      <section
        id="domain-trade-promo"
        data-admin-domain="trade"
        data-admin-writer="point_promotion_orders"
        className="space-y-1"
      >
        <p className="px-1 sam-text-xxs font-semibold uppercase tracking-wide text-sam-muted">
          DOMAIN: TRADE · writer: point_promotion_orders (trade)
        </p>
        <AdminCommunityPromotionQueue domain="trade" />
      </section>
      <section
        id="domain-community-promo"
        data-admin-domain="community"
        data-admin-writer="point_promotion_orders"
        className="space-y-1"
      >
        <p className="px-1 sam-text-xxs font-semibold uppercase tracking-wide text-sam-muted">
          DOMAIN: COMMUNITY · writer: point_promotion_orders (community)
        </p>
        <AdminCommunityPromotionQueue domain="community" />
      </section>
      <section
        id="domain-feed-ad"
        data-admin-domain="feed_banner"
        data-admin-writer="feed_ad_requests"
        className="space-y-1"
      >
        <p className="px-1 sam-text-xxs font-semibold uppercase tracking-wide text-sam-muted">
          DOMAIN: FEED BANNER · writer: feed_ad_requests (Growth)
        </p>
        <AdminFeedAdRequestQueue />
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCommunityPromotionQueue } from "@/components/admin/ads/AdminCommunityPromotionQueue";
import { AdminFeedAdRequestQueue } from "@/components/admin/ads/AdminFeedAdRequestQueue";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type AdApplicationDomain = "trade" | "community" | "feed";

const DOMAIN_CHOICES: Array<{
  domain: AdApplicationDomain;
  href: string;
  titleKey: MessageKey;
  descKey: MessageKey;
  fallbackTitleKo: string;
  fallbackTitleEn: string;
  fallbackDescKo: string;
  fallbackDescEn: string;
}> = [
  {
    domain: "trade",
    href: "/admin/ad-applications?domain=trade",
    titleKey: "admin_ad_applications_trade_title",
    descKey: "admin_ad_applications_trade_desc",
    fallbackTitleKo: "거래 더 알리기 신청",
    fallbackTitleEn: "Trade promote requests",
    fallbackDescKo: "point_promotion_orders 중 domain=trade 큐만 심사합니다.",
    fallbackDescEn: "Review only point_promotion_orders where domain=trade.",
  },
  {
    domain: "community",
    href: "/admin/ad-applications?domain=community",
    titleKey: "admin_ad_applications_community_title",
    descKey: "admin_ad_applications_community_desc",
    fallbackTitleKo: "커뮤니티 더 알리기 신청",
    fallbackTitleEn: "Community promote requests",
    fallbackDescKo: "point_promotion_orders 중 domain=community 큐만 심사합니다.",
    fallbackDescEn: "Review only point_promotion_orders where domain=community.",
  },
  {
    domain: "feed",
    href: "/admin/ad-applications?domain=feed",
    titleKey: "admin_ad_applications_feed_title",
    descKey: "admin_ad_applications_feed_desc",
    fallbackTitleKo: "피드 배너 광고 신청",
    fallbackTitleEn: "Feed banner ad requests",
    fallbackDescKo: "feed_ad_requests 큐만 심사합니다. 캠페인 관리는 /admin/feed-ads를 유지합니다.",
    fallbackDescEn: "Review only feed_ad_requests. Campaign management remains at /admin/feed-ads.",
  },
];

function normalizeDomain(value: string | null): AdApplicationDomain | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "trade" || raw === "community" || raw === "feed") return raw;
  if (raw === "feed_banner" || raw === "feed-ad") return "feed";
  return null;
}

/**
 * /admin/ad-applications — one domain queue per render (KEEP).
 * NOT a unified ads table. Writers stay per queue.
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 * CUT 1: domain section ownership labels (Trade / Community / Feed Banner).
 */
export function AdminAdApplicationsPage({ forcedDomain }: { forcedDomain?: AdApplicationDomain }) {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const domain = forcedDomain ?? normalizeDomain(searchParams.get("domain"));
  const choice = DOMAIN_CHOICES.find((item) => item.domain === domain) ?? null;

  if (!choice) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          title={safeT("admin_ad_applications_choose_title", {
            fallbackKo: "광고 신청 도메인 선택",
            fallbackEn: "Choose ad request domain",
          })}
          description={safeT("admin_ad_applications_choose_desc", {
            fallbackKo: "거래, 커뮤니티, 피드 배너 중 하나를 선택하면 해당 writer 큐만 표시됩니다.",
            fallbackEn:
              "Choose Trade, Community, or Feed Banner to show only that writer queue.",
          })}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {DOMAIN_CHOICES.map((item) => (
            <Link
              key={item.domain}
              href={item.href}
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 transition hover:border-sam-primary hover:bg-sam-primary/5"
            >
              <p className="sam-text-body font-semibold text-sam-fg">
                {safeT(item.titleKey, {
                  fallbackKo: item.fallbackTitleKo,
                  fallbackEn: item.fallbackTitleEn,
                })}
              </p>
              <p className="mt-1 sam-text-helper text-sam-muted">
                {safeT(item.descKey, {
                  fallbackKo: item.fallbackDescKo,
                  fallbackEn: item.fallbackDescEn,
                })}
              </p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={safeT(choice.titleKey, {
          fallbackKo: choice.fallbackTitleKo,
          fallbackEn: choice.fallbackTitleEn,
        })}
        description={safeT(choice.descKey, {
          fallbackKo: choice.fallbackDescKo,
          fallbackEn: choice.fallbackDescEn,
        })}
      />
      {domain === "trade" ? (
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
      ) : null}
      {domain === "community" ? (
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
      ) : null}
      {domain === "feed" ? (
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
      ) : null}
    </div>
  );
}

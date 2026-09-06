"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCommunityPromotionQueue } from "@/components/admin/ads/AdminCommunityPromotionQueue";
import { AdminFeedAdRequestQueue } from "@/components/admin/ads/AdminFeedAdRequestQueue";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { ARO_IA_001_COMMUNITY_PROMOTIONS_PATH } from "@/lib/admin/aro-ia-001-community-common-links";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";

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
    href: ARO_IA_001_COMMUNITY_PROMOTIONS_PATH,
    titleKey: "admin_ad_applications_community_title",
    descKey: "admin_ad_applications_community_desc",
    fallbackTitleKo: "커뮤니티 더 알리기 신청",
    fallbackTitleEn: "Community promote requests",
    fallbackDescKo: "커뮤니티 홍보 큐(/admin/community/promotions)로 이동합니다.",
    fallbackDescEn: "Opens the community promotions queue (/admin/community/promotions).",
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
 * Community → MERGE redirect to /admin/community/promotions (canonical entry).
 */
export function AdminAdApplicationsPage({ forcedDomain }: { forcedDomain?: AdApplicationDomain }) {
  const { safeT, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const domain = forcedDomain ?? normalizeDomain(searchParams.get("domain"));
  const choice = DOMAIN_CHOICES.find((item) => item.domain === domain) ?? null;
  const returnTo = readAdminReturnToFromSearch(searchParams);

  useEffect(() => {
    if (forcedDomain === "community" || domain === "community") {
      router.replace(ARO_IA_001_COMMUNITY_PROMOTIONS_PATH);
    }
  }, [domain, forcedDomain, router]);

  if (domain === "community" || forcedDomain === "community") {
    return (
      <p className="text-sm text-sam-muted">
        {koLanguageRedirect(language)}
      </p>
    );
  }

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
          backHref={returnTo ?? undefined}
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
    <div className="space-y-4" data-aro-ops-ux-001-w3="1" data-admin-mgmt-proof="community-promotions">
      <AdminPageHeader
        title={safeT(choice.titleKey, {
          fallbackKo: choice.fallbackTitleKo,
          fallbackEn: choice.fallbackTitleEn,
        })}
        description={safeT(choice.descKey, {
          fallbackKo: choice.fallbackDescKo,
          fallbackEn: choice.fallbackDescEn,
        })}
        backHref={returnTo ?? undefined}
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
      <span className="sr-only" data-aro-ia-001-community-promo-path={ARO_IA_001_COMMUNITY_PROMOTIONS_PATH} />
    </div>
  );
}

function koLanguageRedirect(language: string | undefined): string {
  return language === "en" ? "Redirecting to community promotions…" : "커뮤니티 홍보 큐로 이동 중…";
}

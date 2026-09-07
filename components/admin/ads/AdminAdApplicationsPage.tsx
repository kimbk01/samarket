"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminOpsCrossLinkBar } from "@/components/admin/AdminOpsCrossLinkBar";
import { AdminCommunityPromotionQueue } from "@/components/admin/ads/AdminCommunityPromotionQueue";
import { AdminFeedAdRequestQueue } from "@/components/admin/ads/AdminFeedAdRequestQueue";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  ARO_IA_001_ADS_HUB_PATH,
  ARO_IA_001_COMMUNITY_PROMOTIONS_PATH,
} from "@/lib/admin/aro-ia-001-community-common-links";
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
    // MERGE: choose-card + legacy ?domain=community → canonical Community entry
    href: ARO_IA_001_COMMUNITY_PROMOTIONS_PATH,
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
 *
 * MERGE (Ads reconstruction):
 * - Legacy `/admin/ad-applications?domain=community` redirects to
 *   `/admin/community/promotions` (canonical entry).
 * - Canonical page mounts this component with `forcedDomain="community"` and
 *   MUST render the community queue in-place (never hollow redirect).
 */
export function AdminAdApplicationsPage({
  forcedDomain,
}: {
  forcedDomain?: AdApplicationDomain;
}) {
  const { safeT, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryDomain = normalizeDomain(searchParams.get("domain"));
  const domain = forcedDomain ?? queryDomain;
  const choice = DOMAIN_CHOICES.find((item) => item.domain === domain) ?? null;
  const returnTo = readAdminReturnToFromSearch(searchParams);

  // Legacy query URL only — do NOT redirect when forcedDomain (canonical owner).
  const shouldRedirectLegacyCommunity =
    !forcedDomain && queryDomain === "community";

  useEffect(() => {
    if (shouldRedirectLegacyCommunity) {
      router.replace(ARO_IA_001_COMMUNITY_PROMOTIONS_PATH);
    }
  }, [shouldRedirectLegacyCommunity, router]);

  if (shouldRedirectLegacyCommunity) {
    return (
      <p className="text-sm text-sam-muted">
        {language === "en"
          ? "Redirecting to community promotions…"
          : "커뮤니티 홍보 큐로 이동 중…"}
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
            fallbackKo: "승인 전 광고 신청을 상품별로 확인합니다. 승인 뒤 운영은 노출 관리에서 처리합니다.",
            fallbackEn:
              "Review pre-approval ad applications by product. Approved campaigns move to operations.",
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

  const communityCrossLinks =
    domain === "community"
      ? ([
          {
            href: ARO_IA_001_ADS_HUB_PATH,
            labelKo: "광고 / 노출 운영 보기",
            labelEn: "View Ads / Exposure ops",
            dataAttr: "community-promo-to-ads",
          },
        ] as const)
      : [];

  return (
    <div className="space-y-4" data-aro-ops-ux-001-w3="1" data-admin-mgmt-proof="community-promotions">
      <AdminPageHeader
        title={safeT(choice.titleKey, {
          fallbackKo: choice.fallbackTitleKo,
          fallbackEn: choice.fallbackTitleEn,
        })}
        description={
          domain === "community"
            ? safeT(choice.descKey, {
                fallbackKo: "커뮤니티 내 포인트 홍보 신청을 승인 전 상태에서 처리합니다.",
                fallbackEn: "Review Community Point promotion applications before approval.",
              })
            : safeT(choice.descKey, {
                fallbackKo: choice.fallbackDescKo,
                fallbackEn: choice.fallbackDescEn,
              })
        }
        backHref={returnTo ?? (forcedDomain === "community" ? "/admin/community" : undefined)}
      />
      {domain === "community" ? (
        <Suspense fallback={null}>
          <AdminOpsCrossLinkBar
            links={communityCrossLinks}
            noteKo="커뮤니티 내 포인트 홍보입니다. Feed Ads·배달 광고 집행과는 별도입니다."
            noteEn="Community Point-based promotion. Separate from Feed Ads and Delivery ad execution."
          />
        </Suspense>
      ) : null}
      {domain === "trade" ? (
        <section
          id="domain-trade-promo"
          data-admin-domain="trade"
          className="space-y-1"
        >
          <p className="px-1 sam-text-xxs font-semibold text-sam-muted">
            {language === "en"
              ? "Application actions only: detail, approve, hold when supported, reject."
              : "신청 업무 전용: 상세, 승인, 보류(지원 시), 반려만 처리합니다."}
          </p>
          <AdminCommunityPromotionQueue domain="trade" />
        </section>
      ) : null}
      {domain === "community" ? (
        <section
          id="domain-community-promo"
          data-admin-domain="community"
          className="space-y-1"
        >
          <p className="px-1 sam-text-xxs font-semibold text-sam-muted">
            {language === "en"
              ? "Application actions only: detail, approve, hold when supported, reject."
              : "신청 업무 전용: 상세, 승인, 보류(지원 시), 반려만 처리합니다."}
          </p>
          <AdminCommunityPromotionQueue domain="community" />
        </section>
      ) : null}
      {domain === "feed" ? (
        <section
          id="domain-feed-ad"
          data-admin-domain="feed_banner"
          className="space-y-1"
        >
          <p className="px-1 sam-text-xxs font-semibold text-sam-muted">
            {language === "en"
              ? "Application actions only: detail, approve, hold when supported, reject."
              : "신청 업무 전용: 상세, 승인, 보류(지원 시), 반려만 처리합니다."}
          </p>
          <AdminFeedAdRequestQueue />
        </section>
      ) : null}
      {/* ARO-IA-001: path constant kept for static contract (primary Community entry). */}
      <span className="sr-only" data-aro-ia-001-community-promo-path={ARO_IA_001_COMMUNITY_PROMOTIONS_PATH} />
    </div>
  );
}
